'use strict';

/**
 * 变量区
 */

var localStream;
var localVideo = document.querySelector('#localVideo');
var constraints = {
    video: true,
    audio: true
};


var room = 'anc';
var ws = new WebSocket('ws://localhost');
//var ws = new WebSocket('wss://' + location.host);

//存储建立的 RTCPeerConnection 连接，{'pcid': pcid, 'pc': pc}，其中 pcid 是唯一确定的
var pcArray = [];
var pc = null;
var pcConfig = {
    'iceServers':[
    /*{
        'urls': 'stun:stun.l.google.com:19302'
    },*/
    {
        'urls': 'turn:helloturn.cn:3478',
        'username': 'hellouser',
        'credential': 'hellooo123'
    }]
};

/**
 * 函数区
 */

function gotStream(stream){
    localStream = stream;
    localVideo.srcObject = stream;

    console.log('Anchorman got stream');
}

function sendMessage(_message){
    var message = JSON.stringify(_message);
    console.log(message);
    ws.send(message);
}

function onCreateOffer(desc){
    pc.setLocalDescription(desc, () => {
        sendMessage({
            type:'offer',
            content:pc.localDescription
        });
    });
}


ws.onbeforeunload = () => ws.close();

ws.onopen = () => {
    console.log('anchorman websocket connected!');
    startProcess();
}

ws.onmessage = _message => {
    console.log(_message);

    //var message = JSON.parse(_message);
    var message = JSON.parse(_message.data);
    console.log('anchorman receive message!');

    switch(message.type){
        case 'createResponse':
            if(message.state==='success')
                console.log('Created room ' + room);
            else
                console.log('room ' + room + ' is unavailable');
            break;
        case 'ready':
            ready();
            break;
        case 'answer':
            answer(message);
            break;
        case 'candidate':
            candidate(message);
            break;
        default:
            console.log('unrecognized message!'+message)
            break;
    }
}

function ready(){
    console.log('Anchorman ready!');

    pc = new RTCPeerConnection(pcConfig);
    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    })

    pc.onicecandidate = event => {
        if(event.candidate){
            sendMessage({
                type: 'candidate',
                from: 'anchorman',
                lable: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            });
        }else{
            console.log('End of candidates');
        }
    }

    pc.onconnectionstatechange = event => {
        if(pc.connectionState === 'connected'){
            console.log('Anchorman: RTCPeerConnection successfully setup!');
            pcArray.push({'pcid': id, 'pc': pc});
            //pc = null;
        }
    }

    pc.createOffer().then(onCreateOffer)
        .catch(e => console.log('Some error occured'));
}

function answer(message){
    console.log('Got answer');
    const remoteDesc = new RTCSessionDescription(message.content);
    pc.setRemoteDescription(remoteDesc);
}

function candidate(message){
    pc.addIceCandidate(new RTCIceCandidate({
        candidate: message.candidate,
        sdpMLineIndex: message.lable,
        sdpMid: message.id
    }));
}


/**
 * 
 */

navigator.mediaDevices.getUserMedia(constraints)
    .then(gotStream).catch(e => alert('getUserMedia() error: ' + e.name));

function startProcess(){
    if(room !== ''){
        sendMessage({
            type:'create',
            room:room
        });
        console.log('Attempted to create room ', room);
    }
}