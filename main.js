import './style.css';
import firebase from 'firebase/app';
import 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDooJlQCfk104yS4XzOj1bgpVEoOB8rTnQ",
  authDomain: "webrtc-demo-33437.firebaseapp.com",
  projectId: "webrtc-demo-33437",
  storageBucket: "webrtc-demo-33437.firebasestorage.app",
  messagingSenderId: "99021841417",
  appId: "1:99021841417:web:510b0562a0d20c437ec4d8",
  measurementId: "G-H2KFF0EHS0"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

let localStream = null;
let audioTrack = null;
let isMuted = false;

const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const joinInput = document.getElementById('joinInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');
const muteButton = document.getElementById('muteButton');
const callStatus = document.getElementById('callStatus');
const mapContainer = document.getElementById('map');

webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  webcamVideo.srcObject = localStream;
  audioTrack = localStream.getAudioTracks()[0];

  webcamButton.disabled = true;
  callButton.disabled = false;
  answerButton.disabled = false;
  muteButton.disabled = false;

  callStatus.innerText = 'Webcam ready';
};

muteButton.onclick = () => {
  if (!audioTrack) return;
  isMuted = !isMuted;
  audioTrack.enabled = !isMuted;
  muteButton.innerText = isMuted ? 'Unmute Mic' : 'Mute Mic';
};

callButton.onclick = async () => {
  const pc = new RTCPeerConnection(servers);
  const remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.ontrack = event => {
    event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
  };

  pc.oniceconnectionstatechange = () => {
    callStatus.innerText = `ICE State: ${pc.iceConnectionState}`;
  };

  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');
  callInput.value = callDoc.id;
  navigator.clipboard.writeText(callDoc.id);

  callStatus.innerText = 'Waiting for answer... (Room ID copied)';

  pc.onicecandidate = event => {
    if (event.candidate) {
      offerCandidates.add(event.candidate.toJSON());
    }
  };

  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);
  await callDoc.set({ offer: { sdp: offerDescription.sdp, type: offerDescription.type } });

  callDoc.onSnapshot(snapshot => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
      callStatus.innerText = 'Connected';
    }
  });

  answerCandidates.onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};

answerButton.onclick = async () => {
  const callId = joinInput.value.trim();
  if (!callId) return;

  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  const pc = new RTCPeerConnection(servers);
  const remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.ontrack = event => {
    event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
  };

  pc.oniceconnectionstatechange = () => {
    callStatus.innerText = `ICE State: ${pc.iceConnectionState}`;
  };

  pc.onicecandidate = event => {
    if (event.candidate) {
      answerCandidates.add(event.candidate.toJSON());
    }
  };

  const callData = (await callDoc.get()).data();
  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);
  await callDoc.update({ answer: { type: answerDescription.type, sdp: answerDescription.sdp } });

  offerCandidates.onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });

  callStatus.innerText = 'Connected';
  hangupButton.disabled = false;
};

// Google Maps Integration
window.initMap = function () {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser");
    return;
  }
  navigator.geolocation.getCurrentPosition(position => {
    const userLat = position.coords.latitude;
    const userLng = position.coords.longitude;

    const map = new google.maps.Map(mapContainer, {
      center: { lat: userLat, lng: userLng },
      zoom: 10,
    });

    new google.maps.Marker({
      position: { lat: userLat, lng: userLng },
      map,
      label: 'You',
    });

    const radiusKm = 50;
    const stepKm = 10;
    for (let angle = 0; angle < 360; angle += 360 / (radiusKm / stepKm * 4)) {
      for (let r = stepKm; r <= radiusKm; r += stepKm) {
        const offsetLat = r / 111 * Math.cos(angle * Math.PI / 180);
        const offsetLng = r / (111 * Math.cos(userLat * Math.PI / 180)) * Math.sin(angle * Math.PI / 180);
        const markerLat = userLat + offsetLat;
        const markerLng = userLng + offsetLng;
        new google.maps.Marker({
          position: { lat: markerLat, lng: markerLng },
          map,
        });
      }
    }
  });
};
