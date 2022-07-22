import { WasmModule } from "../../../impl/modules";
import { TransportLayer, MessageHandler, ClientMessage } from "../../../protocol/protocol";
import { MessagesQueue } from "../../../protocol/messages-queue";
import { createWorker as _cw } from "./create-worker";

export type CreateWorker=(url: string) => Promise<Worker> | Worker
let createWorker:CreateWorker=_cw
export const setCreateWorker=function(f:CreateWorker){createWorker=f}

export async function dosWorker(workerUrl: string,
                                wasmModule: WasmModule,
                                sessionId: string): Promise<TransportLayer> {
    const messagesQueue = new MessagesQueue();
    let handler: MessageHandler = messagesQueue.handler.bind(messagesQueue);

    const worker = await createWorker(workerUrl);
    worker.onerror = (e) => {
        handler("ws-err", { type: e.type, filename: e.filename, message: e.message });
    };
    worker.onmessage = (e) => {
        const data = e.data;
        if (data?.name !== undefined) {
            handler(data.name, data.props);
        }
    };

    await wasmModule.instantiate({});

    const transportLayer: TransportLayer = {
        sessionId,
        sendMessageToServer: (name: ClientMessage, props?: {[key: string]: any}) => {
            worker.postMessage({ name, props });
        },
        initMessageHandler: (newHandler: MessageHandler) => {
            handler = newHandler;
            messagesQueue.sendTo(handler);
        },
        exit: () => {
            worker.terminate();
        },
    };

    try {
        transportLayer.sendMessageToServer("wc-install", {
            module: (wasmModule as any).wasmModule,
            sessionId,
        });
    } catch (e) {
        transportLayer.sendMessageToServer("wc-install", { sessionId });
    }

    return transportLayer;
}
