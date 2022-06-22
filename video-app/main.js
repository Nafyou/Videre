import './style.css';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

// Firebase config key
const firebaseConfig = {
  apiKey: "AIzaSyAbPs7io6ROI18JR1viiHKruTLunEmHETk",
  authDomain: "video-app-one.firebaseapp.com",
  projectId: "video-app-one",
  storageBucket: "video-app-one.appspot.com",
  messagingSenderId: "908062093414",
  appId: "1:908062093414:web:3c5691c3cc81150f043da7",
  measurementId: "G-6XGNN35FRB"
};

if (!firebase.apps.length){
  firebase.initializeApp(firebaseConfig)
}

const firestore = firebase.firestore(); 

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.1.google.com:19302','stun:stun2.1.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State allows you to share important pieces of information between UI frameworks like React

// Manages p2p params: stun server candidates
let pc = new RTCPeerConnection(servers);

// Streams of each user
let localStream = null;
let remoteStream = null;

// Prototyping with vanilla JS so get every element we want access to
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// Setup media sources
// Obtain webcam stream by bringing dialogue to host
webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});

  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // pull tracks from remote stream and add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  // Applies the streams to video objects in the source DOM
  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;


  
  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;

};

// 2. Create an offer using a call button
callButton.onclick = async () => {
  // Create a reference for firestore collection
  const callDoc = firestore.collection('calls').doc();


  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');


  // When we reference that document without an ID firebase automatically generates the document for us
  callInput.value = callDoc.id;

  // Get candidates for caller, save to db. Ice candidate contains IP adress and port pair to create peer 2 peer connection
  pc.oniceandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };
  //Create Offer
  const offerDescription = await pc.createOffer();

  // set LocalDescription automatically started generating ice candidates
  await pc.setLocalDescription(offerDescription);

  // Note: SDP(session description protocol) contains information about codec, etc
  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({offer});

  // Listen for an answer from the remote server
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer){
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered add candidates to peer connection
  answerCandidates.onSnapshot( (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;

};

// Answer the call with an unique ID


// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  
  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      };
    });
  });
};
