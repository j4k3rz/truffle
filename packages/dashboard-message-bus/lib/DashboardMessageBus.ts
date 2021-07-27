import WebSocket from "ws";
import { base64ToJson, jsonToBase64, sendAndAwait } from "./utils";
import delay from "delay";
import { Request } from "./types";

export class DashboardMessageBus {
  clientServer: WebSocket.Server;
  connectedClientCount = 0;

  dashboardServer: WebSocket.Server;
  dashboardSocket: WebSocket;

  unfulfilledRequests: Map<string, Request> = new Map([]);

  start(providerPort: number, dashboardPort: number) {
    this.dashboardServer = new WebSocket.Server({ host: '0.0.0.0', port: dashboardPort });
    this.dashboardServer.on("connection", (socket: WebSocket) => {
      this.dashboardSocket = socket;

      // Process all backlogged (unfulfilled) requests on new dashboard connection.
      this.unfulfilledRequests.forEach(({ socket, data }) => this.processRequest(socket, data));
    });

    this.clientServer = new WebSocket.Server({ host: '0.0.0.0', port: providerPort });
    this.clientServer.on("connection", (socket: WebSocket) => {
      this.connectedClientCount++;

      socket.on("message", (data: WebSocket.Data) => {
        this.processRequest(socket, data);
      });

      socket.on("close", () => {
        if (--this.connectedClientCount <= 0) {
          process.exit(0);
        }
      });
    });
  }

  // Wait until the dashboard process is started and the websocket connection is established
  async ready() {
    if (this.dashboardSocket) return;
    await delay(1000);
    await this.ready();
  }

  async processRequest(socket: WebSocket, data: WebSocket.Data) {
    if (typeof data !== "string") return;

    this.unfulfilledRequests.set(data, { socket, data });

    await this.ready();

    const decodedData = base64ToJson(data);

    let responsePayload;
    try {
      responsePayload = await sendAndAwait(this.dashboardSocket, decodedData.payload);
    } catch {
      return;
    }

    const response = {
      id: decodedData.id,
      payload: responsePayload
    };

    const encodedResponse = jsonToBase64(response);
    socket.send(encodedResponse);

    this.unfulfilledRequests.delete(data);
  }
}