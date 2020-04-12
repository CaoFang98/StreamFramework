'use strict';

/**
 * 变量区
 */

var remoteStream = new MediaStream();
var remoteVideo = document.querySelector('#remoteVideo');
remoteVideo.srcObject = remoteStream;


var room = 'anc';
var ws = new WebSocket('ws://localhost');
//var ws = new WebSocket('wss://' + location.host);

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

function sendMessage(_message){
    var message = JSON.stringify(_message);
    console.log(message);
    ws.send(message);
}

function onCreateAnswer(desc){
    pc.setLocalDescription(desc, () => {
        sendMessage({
            type:'answer',
            content:pc.localDescription
        });
    });
}

ws.onbeforeunload = () => ws.close();

ws.onopen = () => {
    console.log('audience websocket connected!');
    startProcess();
}

ws.onmessage = _message => {
    console.log(_message);

    //var message = JSON.parse(_message);
    var message = JSON.parse(_message.data);
    console.log('audience receive message!');

    switch(message.type){
        case 'joinResponse':
            if(message.state==='success')
                console.log('joined: ' + room);
            else{
                if(message.numClients===0)
                    console.log('Anchorman is not online');
                else
                    console.log('Another one is connecting with anchorman, please wait...');
            }
            break;
        case 'ready':
            ready();
            break;
        case 'offer':
            offer(message);
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
    console.log('Audience ready!');

    pc = new RTCPeerConnection(pcConfig);

    pc.onicecandidate = event => {
        if(event.candidate){
            sendMessage({
                type: 'candidate',
                from: 'audience',
                lable: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            });
        }else{
            console.log('End of candidates');
        }
    }

    pc.ontrack = async (event) => {
        console.log('Audience: ontrack callback function called');
        remoteStream.addTrack(event.track);
    };
    
    //pc.addEventListener('track', async event => {
    //    console.log('Audience: ontrack callback function called');
    //    remoteStream.addTrack(event.track);
    //});

    pc.onconnectionstatechange = event => {
        if(pc.connectionState === 'connected'){
            console.log('Audience: RTCPeerConnection successfully setup!');
            //console.log('Audience ' + socket.id + ' is leaving room ' + room);
            //socket.emit('leave', room);
            sendMessage({type:'leave'});
        }
    }
}

function offer(message){
    console.log('Got offer. Sending answer to peer');
    pc.setRemoteDescription(new RTCSessionDescription(message.content));
    pc.createAnswer().then(onCreateAnswer)
        .catch(e => console.log('Some error occured'));
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
function startProcess(){
    if(room !== ''){
        sendMessage({
            type:'join',
            room:room
        });
        console.log('Attempted to join room ', room);
    }
}