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

const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');
const mapContainer = document.getElementById('map');

webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  webcamVideo.srcObject = localStream;

  webcamButton.disabled = true;
  callButton.disabled = false;
  answerButton.disabled = false;
};

callButton.onclick = async () => {
  const pc = new RTCPeerConnection(servers);
  const remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.ontrack = event => {
    event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
  };

  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');
  callInput.value = callDoc.id;

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
  const callId = callInput.value.trim();
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

  hangupButton.disabled = false;
};

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
      zoom: 11,
    });

    new google.maps.Marker({
      position: { lat: userLat, lng: userLng },
      map,
      label: 'You',
    });

    const radiusKm = 10;
    const totalMarkers = 20;

    for (let i = 0; i < totalMarkers; i++) {
      const randomDistance = Math.random() * radiusKm;
      const randomBearing = Math.random() * 360;

      const offsetLat = randomDistance * Math.cos(randomBearing * Math.PI / 180) / 111;
      const offsetLng = randomDistance * Math.sin(randomBearing * Math.PI / 180) / (111 * Math.cos(userLat * Math.PI / 180));

      const markerLat = userLat + offsetLat;
      const markerLng = userLng + offsetLng;

      new google.maps.Marker({
        position: { lat: markerLat, lng: markerLng },
        map,
        icon: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png'
      });
    }
  });
};
