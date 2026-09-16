export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InsufficientBudgetError extends DomainError {}
export class SquadCapExceededError extends DomainError {}
// Distinct from SquadCapExceededError — this is a settings-edit-time
// validation guard (rejecting a maxPerTeam decrease below an already-reached
// count), never a live-action block. Category caps are advisory everywhere
// else; see lib/auction/categoryCaps.ts.
export class CategoryCapExceededError extends DomainError {}
export class InvalidStateTransitionError extends DomainError {}
export class ValidationError extends DomainError {}
