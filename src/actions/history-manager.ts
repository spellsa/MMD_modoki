import type { BuiltCommand } from "./command-types";

export type HistoryManagerOptions = {
    maxEntries?: number;
};

export class HistoryManager {
    private readonly maxEntries: number;
    private readonly past: BuiltCommand[] = [];
    private readonly future: BuiltCommand[] = [];

    public constructor(options: HistoryManagerOptions = {}) {
        this.maxEntries = normalizeMaxEntries(options.maxEntries);
    }

    public push(command: BuiltCommand): void {
        this.past.push(command);
        if (this.past.length > this.maxEntries) {
            this.past.splice(0, this.past.length - this.maxEntries);
        }
        this.future.length = 0;
    }

    public undo(): BuiltCommand | null {
        const command = this.past.pop();
        if (!command) return null;
        this.future.push(command);
        return command;
    }

    public redo(): BuiltCommand | null {
        const command = this.future.pop();
        if (!command) return null;
        this.past.push(command);
        return command;
    }

    public clear(reason: string): void {
        void reason;
        this.past.length = 0;
        this.future.length = 0;
    }

    public canUndo(): boolean {
        return this.past.length > 0;
    }

    public canRedo(): boolean {
        return this.future.length > 0;
    }

    public getUndoCount(): number {
        return this.past.length;
    }

    public getRedoCount(): number {
        return this.future.length;
    }
}

function normalizeMaxEntries(maxEntries: number | undefined): number {
    if (maxEntries === undefined) return 100;
    if (!Number.isFinite(maxEntries)) return 100;
    return Math.max(1, Math.floor(maxEntries));
}
