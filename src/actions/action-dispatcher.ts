import type { EditorAction, EditorActionType } from "./types";

export type EditorActionHandler<TAction extends EditorAction = EditorAction> = (action: TAction) => void;
type EditorActionOfType<TType extends EditorActionType> = Extract<EditorAction, { type: TType }>;

export class ActionDispatcher {
    private readonly handlers = new Map<EditorActionType, EditorActionHandler[]>();

    register<TType extends EditorActionType>(
        type: TType,
        handler: EditorActionHandler<EditorActionOfType<TType>>,
    ): () => void {
        const handlers = this.handlers.get(type) ?? [];
        const typedHandler = handler as EditorActionHandler;
        handlers.push(typedHandler);
        this.handlers.set(type, handlers);

        return () => {
            const currentHandlers = this.handlers.get(type);
            if (!currentHandlers) return;

            const nextHandlers = currentHandlers.filter((item) => item !== typedHandler);
            if (nextHandlers.length === 0) {
                this.handlers.delete(type);
                return;
            }
            this.handlers.set(type, nextHandlers);
        };
    }

    dispatch(action: EditorAction): boolean {
        const handlers = this.handlers.get(action.type);
        if (!handlers || handlers.length === 0) return false;

        for (const handler of handlers) {
            handler(action);
        }
        return true;
    }

    hasHandler(type: EditorActionType): boolean {
        return (this.handlers.get(type)?.length ?? 0) > 0;
    }
}
