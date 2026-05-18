import { describe, expect, it } from "vitest";

import { ActionDispatcher } from "../../src/actions/action-dispatcher";
import type { EditorAction } from "../../src/actions/types";

describe("ActionDispatcher", () => {
    it("dispatches an action to registered handlers", () => {
        const dispatcher = new ActionDispatcher();
        const received: EditorAction[] = [];

        dispatcher.register("playback.toggle", (action) => {
            received.push(action);
        });

        const handled = dispatcher.dispatch({ type: "playback.toggle", source: "shortcut" });

        expect(handled).toBe(true);
        expect(received).toEqual([{ type: "playback.toggle", source: "shortcut" }]);
    });

    it("returns false for actions without handlers", () => {
        const dispatcher = new ActionDispatcher();

        expect(dispatcher.dispatch({ type: "keyframe.addCurrent", source: "button" })).toBe(false);
    });

    it("unregisters handlers", () => {
        const dispatcher = new ActionDispatcher();
        let count = 0;

        const unregister = dispatcher.register("keyframe.deleteSelected", () => {
            count += 1;
        });

        expect(dispatcher.hasHandler("keyframe.deleteSelected")).toBe(true);
        unregister();

        expect(dispatcher.hasHandler("keyframe.deleteSelected")).toBe(false);
        expect(dispatcher.dispatch({ type: "keyframe.deleteSelected", source: "shortcut" })).toBe(false);
        expect(count).toBe(0);
    });
});

