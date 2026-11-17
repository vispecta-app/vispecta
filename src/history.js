// Undo / redo (#67).
//
// Instead of every action knowing how to undo itself, the app takes a snapshot of what the user can
// change – visibility, colours, sections, measurements, drawn lines, the corridor – whenever an
// action has settled (a click, a key, a change, a moved plane; 250 ms after the last one). If the
// snapshot differs from the last one, the last one goes on the undo stack. Undo puts the previous
// snapshot back. So every action is covered, also new ones, without wiring each button.
//
// The camera is not part of it (saved views cover that), and neither is the selection. Opening or
// removing a model starts the history again.
const LIMIT = 50;
const SETTLE_MS = 250;

export class History {
  /**
   * ctx: {capture() -> {key, models, state}, restore(state), describe(before, after) -> text,
   *       onChange(canUndo, canRedo)}
   * `key` is a string that is equal for equal states; `models` identifies the loaded models.
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.undoStack = [];
    this.redoStack = [];
    this.current = null;
    this.timer = null;
    this.restoring = false;
  }

  /** Something may have changed: take a snapshot once things have settled. */
  touch() {
    if (this.restoring) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.commit(), SETTLE_MS);
  }

  /** Takes a snapshot now; pushes the previous one if the state changed. */
  commit() {
    clearTimeout(this.timer);
    if (this.restoring) return;
    const snap = this.ctx.capture();
    if (!this.current || snap.models !== this.current.models) {
      // first snapshot, or the models changed: start again
      this.undoStack = [];
      this.redoStack = [];
      this.current = snap;
      this.#notify();
      return;
    }
    if (snap.key === this.current.key) return;
    this.undoStack.push(this.current);
    if (this.undoStack.length > LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.current = snap;
    this.#notify();
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  /** Returns a text that says what was undone, or null. */
  undo() {
    this.commit(); // a change that hasn't settled yet counts first
    const prev = this.undoStack.pop();
    if (!prev) return null;
    const text = this.ctx.describe(prev, this.current);
    this.redoStack.push(this.current);
    this.#apply(prev);
    return text;
  }

  redo() {
    this.commit();
    const next = this.redoStack.pop();
    if (!next) return null;
    const text = this.ctx.describe(this.current, next);
    this.undoStack.push(this.current);
    this.#apply(next);
    return text;
  }

  #apply(snap) {
    this.restoring = true;
    try { this.ctx.restore(snap.state); } finally {
      this.current = snap;
      // events the restore itself caused must not count as a new change; the state as it now is
      // becomes the reference (a restore can differ in details that don't matter, e.g. ids)
      setTimeout(() => {
        this.restoring = false;
        const now = this.ctx.capture();
        if (now.models === snap.models) this.current = { ...snap, key: now.key, state: now.state };
      }, SETTLE_MS + 50);
    }
    this.#notify();
  }

  #notify() { this.ctx.onChange?.(this.canUndo, this.canRedo); }
}
