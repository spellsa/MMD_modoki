export type PngFilterStrategy = "none";

export interface PngEncodeRequest {
    taskId: string;
    width: number;
    height: number;
    rgbaBuffer: ArrayBuffer;
    filterStrategy: PngFilterStrategy;
}

export interface PngEncodeSuccess {
    type: "success";
    taskId: string;
    pngBuffer: ArrayBuffer;
    byteLength: number;
    filterStrategy: PngFilterStrategy;
    encodeMs: number;
    filterMs: number;
    deflateMs: number;
    assembleMs: number;
}

export interface PngEncodeFailure {
    type: "failure";
    taskId: string;
    message: string;
}

export type PngEncodeResponse = PngEncodeSuccess | PngEncodeFailure;
