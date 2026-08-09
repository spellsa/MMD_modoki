import { encodeRgba8ToPng } from "./png-encoder";
import type {
    PngEncodeFailure,
    PngEncodeRequest,
    PngEncodeResponse,
    PngEncodeSuccess,
} from "./png-encoder-protocol";

interface PngEncoderWorkerScope {
    onmessage: ((event: { data: PngEncodeRequest }) => void) | null;
    postMessage: (message: PngEncodeResponse, transfer: ArrayBuffer[]) => void;
}

const workerScope = self as unknown as PngEncoderWorkerScope;

const getErrorMessage = (error: unknown): string => (
    error instanceof Error ? error.message : String(error)
);

workerScope.onmessage = (event): void => {
    const request = event.data;
    void encodeRgba8ToPng(
        new Uint8Array(request.rgbaBuffer),
        request.width,
        request.height,
        request.filterStrategy,
    ).then((encoded) => {
        const response: PngEncodeSuccess = {
            type: "success",
            taskId: request.taskId,
            ...encoded,
        };
        workerScope.postMessage(response, [response.pngBuffer]);
    }).catch((error: unknown) => {
        const response: PngEncodeFailure = {
            type: "failure",
            taskId: request.taskId,
            message: getErrorMessage(error),
        };
        workerScope.postMessage(response, []);
    });
};
