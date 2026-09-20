/**
 * Cola de acciones sociales.
 *
 * Nada se escribe en una red sin pasar por aquí. La cola guarda qué se pidió,
 * con qué cuenta, con qué contenido y qué contestó cada red — y nunca una
 * contraseña ni un campo sensible: por construcción no hay dónde ponerlos.
 *
 * Dos reglas del diseño, comprobadas en las pruebas:
 *
 * - Una acción multirred no es «todo o nada»: cada destino tiene su resultado.
 * - Una acción no se marca como publicada si no se ha verificado en la red.
 */

import type {
  ActionError,
  ActionResult,
  ActionStatus,
  ActionTarget,
  SocialAction,
  SocialContent,
  SocialOperation,
  SocialSource,
} from "./types";

export interface ActionQueueOptions {
  /** Reloj inyectable: las pruebas no dependen de la hora real. */
  now?: () => number;
  idFactory?: () => string;
}

export interface EnqueueInput {
  operation: SocialOperation;
  content: SocialContent;
  targets: readonly { accountId: string; source: SocialSource }[];
  origin?: "user" | "assistant";
}

export interface ActionSummary {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  pending: number;
  running: number;
  /** `true` si unos destinos salieron bien y otros no. */
  partial: boolean;
}

let sequence = 0;

function defaultId(): string {
  sequence += 1;
  return `act_${Date.now().toString(36)}_${sequence.toString(36)}`;
}

export class ActionQueue {
  private readonly actions = new Map<string, SocialAction>();
  private readonly now: () => number;
  private readonly idFactory: () => string;

  constructor(options: ActionQueueOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.idFactory = options.idFactory ?? defaultId;
  }

  /** Crea el borrador. Todavía no sale nada a la red, ni siquiera confirmado. */
  enqueue(input: EnqueueInput): SocialAction {
    if (input.targets.length === 0) {
      throw new Error("Una acción necesita al menos una cuenta de destino.");
    }
    const action: SocialAction = {
      id: this.idFactory(),
      operation: input.operation,
      content: input.content,
      targets: input.targets.map((target) => ({
        accountId: target.accountId,
        source: target.source,
        status: "PENDING",
      })),
      status: "DRAFT",
      createdAt: this.now(),
      origin: input.origin ?? "user",
    };
    this.actions.set(action.id, action);
    return action;
  }

  get(id: string): SocialAction | null {
    return this.actions.get(id) ?? null;
  }

  list(filter?: { status?: ActionStatus; source?: SocialSource }): SocialAction[] {
    return [...this.actions.values()]
      .filter((action) => (filter?.status ? action.status === filter.status : true))
      .filter((action) =>
        filter?.source ? action.targets.some((target) => target.source === filter.source) : true,
      )
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Lo que espera al usuario: borradores y acciones por confirmar. */
  pendingConfirmation(): SocialAction[] {
    return this.list().filter(
      (action) => action.status === "DRAFT" || action.status === "AWAITING_CONFIRMATION",
    );
  }

  /** Editar solo tiene sentido antes de confirmar. */
  edit(id: string, content: SocialContent): SocialAction {
    const action = this.require(id);
    if (action.status !== "DRAFT") {
      throw new Error(`No se puede editar una acción en estado ${action.status}.`);
    }
    action.content = content;
    return action;
  }

  /** El usuario confirma: es el único camino a que se escriba en una red. */
  confirm(id: string): SocialAction {
    const action = this.require(id);
    if (action.status !== "DRAFT") {
      throw new Error(`Solo se confirma un borrador, no una acción ${action.status}.`);
    }
    action.status = "AWAITING_CONFIRMATION";
    action.confirmedAt = this.now();
    return action;
  }

  start(id: string): SocialAction {
    const action = this.require(id);
    if (action.status !== "AWAITING_CONFIRMATION") {
      throw new Error(`Solo se ejecuta una acción confirmada, no una ${action.status}.`);
    }
    action.status = "RUNNING";
    action.startedAt = this.now();
    for (const target of action.targets) target.status = "RUNNING";
    return action;
  }

  /**
   * Resultado de un destino. Un `success` sin `verified` no se acepta como
   * éxito: acaba en `FAILED` con el motivo, porque Latido no puede afirmar que
   * algo se publicó sin haberlo comprobado.
   */
  report(id: string, result: ActionResult, accountId?: string): SocialAction {
    const action = this.require(id);
    if (action.status !== "RUNNING") {
      throw new Error(`No se puede informar de una acción en estado ${action.status}.`);
    }
    const target = this.findTarget(action, result.source, accountId);
    if (!target) throw new Error(`La acción ${id} no tiene destino en ${result.source}.`);

    if (result.outcome === "success" && !result.verified) {
      target.status = "FAILED";
      target.error = {
        code: "UNKNOWN",
        message: "La red no confirmó el resultado, así que no se da por publicado.",
      };
    } else if (result.outcome === "success") {
      target.status = "SUCCESS";
    } else if (result.outcome === "cancelled") {
      target.status = "SKIPPED";
      target.error = result.error;
    } else {
      target.status = "FAILED";
      target.error = result.error ?? { code: "UNKNOWN", message: "La acción no se completó." };
    }
    target.result = result;
    return this.settle(action);
  }

  fail(id: string, accountId: string | undefined, error: ActionError): SocialAction {
    const action = this.require(id);
    if (action.status !== "RUNNING") {
      throw new Error(`No se puede informar de una acción en estado ${action.status}.`);
    }
    const target = accountId
      ? action.targets.find((item) => item.accountId === accountId)
      : action.targets.find((item) => item.status === "RUNNING");
    if (!target) throw new Error(`No hay destino que fallar en la acción ${id}.`);
    target.status = "FAILED";
    target.error = error;
    return this.settle(action);
  }

  cancel(id: string): SocialAction {
    const action = this.require(id);
    if (action.status === "SUCCESS" || action.status === "FAILED") {
      throw new Error(`Una acción ${action.status} ya terminó.`);
    }
    action.status = "CANCELLED";
    action.finishedAt = this.now();
    for (const target of action.targets) {
      if (target.status === "PENDING" || target.status === "RUNNING") target.status = "SKIPPED";
    }
    return action;
  }

  summary(id: string): ActionSummary {
    const action = this.require(id);
    const count = (status: ActionTarget["status"]): number =>
      action.targets.filter((target) => target.status === status).length;
    const success = count("SUCCESS");
    const failed = count("FAILED");
    return {
      total: action.targets.length,
      success,
      failed,
      skipped: count("SKIPPED"),
      pending: count("PENDING"),
      running: count("RUNNING"),
      partial: success > 0 && failed > 0,
    };
  }

  /** Historial serializable. No hay secretos porque el modelo no los tiene. */
  toJSON(): SocialAction[] {
    return this.list().map((action) => ({
      ...action,
      targets: action.targets.map((target) => ({ ...target })),
    }));
  }

  /** Reconstruye la cola desde el historial guardado. */
  hydrate(actions: readonly SocialAction[]): void {
    this.actions.clear();
    for (const action of actions) {
      this.actions.set(action.id, {
        ...action,
        targets: action.targets.map((target) => ({ ...target })),
      });
    }
  }

  /** Tira lo viejo y ya resuelto, para que la cola no crezca sin freno. */
  prune(before: number): number {
    let removed = 0;
    for (const [id, action] of this.actions) {
      const finished =
        action.status === "SUCCESS" || action.status === "FAILED" || action.status === "CANCELLED";
      if (finished && action.createdAt < before) {
        this.actions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  private settle(action: SocialAction): SocialAction {
    const resolved = action.targets.every(
      (target) => target.status !== "PENDING" && target.status !== "RUNNING",
    );
    if (!resolved) return action;
    const anySuccess = action.targets.some((target) => target.status === "SUCCESS");
    action.status = anySuccess ? "SUCCESS" : "FAILED";
    action.finishedAt = this.now();
    return action;
  }

  private findTarget(
    action: SocialAction,
    source: SocialSource,
    accountId?: string,
  ): ActionTarget | undefined {
    return action.targets.find(
      (target) =>
        target.source === source &&
        (accountId ? target.accountId === accountId : target.status === "RUNNING"),
    );
  }

  private require(id: string): SocialAction {
    const action = this.actions.get(id);
    if (!action) throw new Error(`No hay ninguna acción con el id ${id}.`);
    return action;
  }
}
