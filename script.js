const callRecipientInput = document.getElementById('callRecipient');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const callStatusDisplay = document.getElementById('callStatus');
const remoteAudio = document.getElementById('remoteAudio');

let localStream;
let peerConnection;
let ws;
const userId = Math.random().toString(36).substring(2, 15); // Simple unique ID

callButton.addEventListener('click', initiateCall);
hangupButton.addEventListener('click', hangUpCall);

function connectWebSocket() {
    ws = new WebSocket(`wss://${window.location.host}/ws`); // Connect to the Worker on the same domain

    ws.onopen = () => {
        console.log('WebSocket connected.');
        sendMessage({ type: 'register', userId });
        callStatusDisplay.textContent = 'Ready to call.';
        callButton.disabled = false;
    };

    ws.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log('Received message:', message);

            switch (message.type) {
                case 'incomingCall':
                    if (confirm(`Incoming call from ${message.callerId}. Accept?`)) {
                        callStatusDisplay.textContent = 'Answering call...';
                        await startWebRTC();
                        const offer = await peerConnection.createOffer();
                        await peerConnection.setLocalDescription(offer);
                        sendMessage({ type: 'offer', recipientId: message.callerId, sdp: offer });
                    } else {
                        sendMessage({ type: 'rejectCall', recipientId: message.callerId });
                    }
                    break;
                case 'offer':
                    callStatusDisplay.textContent = 'Receiving offer...';
                    await startWebRTC();
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    sendMessage({ type: 'answer', recipientId: message.senderId, sdp: answer });
                    break;
                case 'answer':
                    callStatusDisplay.textContent = 'Receiving answer...';
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
                    hangupButton.disabled = false;
                    callStatusDisplay.textContent = 'Call established.';
                    break;
                case 'iceCandidate':
                    if (peerConnection) {
                        try {
                            await peerConnection.addIceCandidate(message.candidate);
                        } catch (e) {
                            console.error('Error adding ICE candidate:', e);
                        }
                    }
                    break;
                case 'callRejected':
                    callStatusDisplay.textContent = `Call to ${message.recipientId} was rejected.`;
                    resetCallUI();
                    break;
                case 'callEnded':
                    callStatusDisplay.textContent = 'Call ended by the other party.';
                    hangUpCall();
                    break;
            }
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket closed.');
        callStatusDisplay.textContent = 'WebSocket disconnected.';
        resetCallUI();
        setTimeout(connectWebSocket, 3000); // Attempt to reconnect
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        callStatusDisplay.textContent = 'WebSocket error.';
        resetCallUI();
    };
}

function sendMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

async function initiateCall() {
    const recipientId = callRecipientInput.value.trim();
    if (!recipientId || recipientId === userId) {
        alert('Please enter a valid recipient ID.');
        return;
    }
    callButton.disabled = true;
    callStatusDisplay.textContent = `Calling ${recipientId}...`;
    await startWebRTC();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendMessage({ type: 'offer', recipientId, sdp: offer });
}

async function startWebRTC() {
    if (peerConnection) return;

    peerConnection = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            // **Replace with your Cloudflare Calls TURN server details:**
            {
                urls: 'turn:your-cloudflare-turn-hostname:3478',
                username: 'your-turn-username',
                credential: 'your-turn-password'
            }
        ]
    });

    peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            remoteAudio.srcObject = event.streams[0];
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendMessage({ type: 'iceCandidate', recipientId: (isCaller ? callRecipientInput.value : null), candidate: event.candidate });
        }
    };

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    } catch (error) {
        console.error('Error accessing media:', error);
        resetCallUI();
    }
}

function hangUpCall() {
    if (peerConnection) {
        sendMessage({ type: 'hangup', recipientId: (isCaller ? callRecipientInput.value : null) });
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    resetCallUI();
    callStatusDisplay.textContent = 'Call ended.';
}

function resetCallUI() {
    callButton.disabled = false;
    hangupButton.disabled = true;
    remoteAudio.srcObject = null;
    isCaller = false;
}

connectWebSocket(); // Initiate WebSocket connection on page load
