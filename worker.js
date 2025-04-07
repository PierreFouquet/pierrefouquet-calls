const users = new Map(); // userId -> WebSocket

export default {
    async fetch(request, env) {
        if (request.headers.get("Upgrade") === "websocket") {
            handleWebSocket(request, env);
            return new Response(null, { status: 101, webSocket: true });
        }

        // Serve static assets from Cloudflare Pages
        try {
            const pageResponse = await env.ASSETS.fetch(request);
            return pageResponse;
        } catch (e) {
            return new Response("Not found", { status: 404 });
        }
    },
};

function handleWebSocket(request, env) {
    const websocket = request.webSocket;
    const userId = null; // Will be set on 'register' message

    websocket.accept();

    websocket.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log('Worker received:', message);

            switch (message.type) {
                case 'register':
                    users.set(message.userId, websocket);
                    console.log(`User registered: ${message.userId}`);
                    break;
                case 'offer':
                case 'answer':
                case 'iceCandidate':
                case 'hangup':
                case 'rejectCall':
                    const recipientWs = users.get(message.recipientId);
                    if (recipientWs) {
                        recipientWs.send(JSON.stringify({ type: message.type, senderId: userId, ...message }));
                    } else {
                        if (message.type === 'offer') {
                            websocket.send(JSON.stringify({ type: 'callRejected', recipientId: message.recipientId }));
                        }
                        console.log(`Recipient ${message.recipientId} not found.`);
                    }
                    break;
                default:
                    console.log('Unknown message type:', message);
            }
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
            websocket.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    };

    websocket.onclose = () => {
        console.log(`WebSocket closed for user: ${userId}`);
        users.delete(userId);
    };

    websocket.onerror = (error) => {
        console.error(`WebSocket error for user: ${userId}`, error);
        users.delete(userId);
    };
}
