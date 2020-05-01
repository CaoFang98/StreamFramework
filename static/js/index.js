/*
 * (C) Copyright 2014-2015 Kurento (http://kurento.org/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

var ws = new WebSocket('wss://' + location.host + '/one2many');
var video;
var webRtcPeer;
var videoStream, audioStream;
var rtcStream, captureStream;
var pc;
var pcConfig = {
    'iceServers':[
    {
        'urls': 'turn:helloturn.cn:3478',
        'username': 'hellouser',
        'credential': 'hellooo123'
    }]
};

var mediaRecorder;
var blobType;
var chunks = [];    //存放记录的流数据
var isPresenter = null;
var isRecording = false;
var isCapturing = false;
var constraints = {
    video: true,
    audio: true
};

const CALLBtnId = 'call', VIEWERBtnId = 'viewer', TERMINATEBtnId = 'terminate',
    RECORDBtnId = 'record', ENDRECORDBtnId = 'endRecord', CAPTUREBtnId = 'captureScreen';

function disableButton(btnId){
	document.getElementById(btnId).disabled = true;
}
	
function enableButton(btnId){
	document.getElementById(btnId).disabled = false;
}

window.onload = function() {
	console = new Console();
	video = document.getElementById('video');

	document.getElementById(CALLBtnId).addEventListener('click', function() { presenter(); } );
	document.getElementById(VIEWERBtnId).addEventListener('click', function() { viewer(); } );
	document.getElementById(TERMINATEBtnId).addEventListener('click', function() { stop(); } );
	document.getElementById(RECORDBtnId).addEventListener('click', function() { record(); } );
	document.getElementById(ENDRECORDBtnId).addEventListener('click', function() { endRecord(); } );
	document.getElementById(CAPTUREBtnId).addEventListener('click', function() { capture(); } );

	disableButton(TERMINATEBtnId);
    disableButton(RECORDBtnId);
    disableButton(ENDRECORDBtnId);
    disableButton(CAPTUREBtnId);
}

window.onbeforeunload = function() {
	ws.close();
}

ws.onmessage = function(message) {
	var parsedMessage = JSON.parse(message.data);
	console.info('Received message: ' + message.data);

	switch (parsedMessage.id) {
	case 'presenterResponse':
		presenterResponse(parsedMessage);
		break;
	case 'viewerResponse':
		viewerResponse(parsedMessage);
		break;
	case 'stopCommunication':
		dispose();
		break;
	case 'iceCandidate':
		webRtcPeer.addIceCandidate(parsedMessage.candidate)
		break;
	default:
		console.error('Unrecognized message', parsedMessage);
	}
}

function presenterResponse(message) {
	if (message.response != 'accepted') {
		var errorMsg = message.message ? message.message : 'Unknow error';
		console.warn('Call not accepted for the following reason: ' + errorMsg);
		dispose();
	} else {
		webRtcPeer.processAnswer(message.sdpAnswer, error => {
			if(error) return onError(error);

			console.log('SDP negotiation complete');
			isPresenter = true;

			disableButton(VIEWERBtnId);
            enableButton(TERMINATEBtnId);
            enableButton(RECORDBtnId);
            enableButton(CAPTUREBtnId);
			
			// console.log(videoStream);
			// console.log(webRtcPeer.getLocalStream());
			// webRtcPeer.getLocalStream().getTracks().forEach(t => console.log(t));
			mediaRecorderInit(webRtcPeer.getLocalStream());
			// var pc = webRtcPeer.getPeerConnection();
			// console.log(pc);
		});
	}
}

function viewerResponse(message) {
	if (message.response != 'accepted') {
		var errorMsg = message.message ? message.message : 'Unknow error';
		console.warn('Call not accepted for the following reason: ' + errorMsg);
		dispose();
	} else {
		webRtcPeer.processAnswer(message.sdpAnswer, error => {
			if(error) return onError(error);

			console.log('SDP negotiation complete');
			isPresenter = false;

			disableButton(CALLBtnId);
            enableButton(TERMINATEBtnId);
            enableButton(RECORDBtnId);
			
			// console.log(videoStream);
			// console.log(webRtcPeer.getRemoteStream());
			// webRtcPeer.getRemoteStream().getTracks().forEach(t => console.log(t));
			// webRtcPeer.getPeerConnection().getReceivers().forEach(r => console.log(r));
			mediaRecorderInit(webRtcPeer.getRemoteStream());
		});
	}
}

function presenter() {
	if (!webRtcPeer) {
		showSpinner(video);

		videoStream = new MediaStream();
		pc = new RTCPeerConnection(pcConfig);
		videoStream.getTracks().forEach(t => {
			pc.addTrack(t, videoStream);
		})
		// audioStream = new MediaStream();
		navigator.mediaDevices.getUserMedia(constraints)
			.then(stream => {
				rtcStream = stream;
    			rtcStream.getTracks().forEach(track => {
					// if(track.kind === 'audio')
					// 	audioStream.addTrack(track);
					// else
						videoStream.addTrack(track);
				});
    			console.log('Presenter got rtc stream');
			})
			.then(() => {
				var options = {
					videoStream: videoStream,//为了实现视频流切换
					// audioStream: audioStream,
					peerConnection: pc,
					localVideo: video,
					onicecandidate : onIceCandidate,
					configuration: pcConfig
				}
		
				webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, function(error) {
					if(error) return onError(error);
		
					this.generateOffer(onOfferPresenter);
				});
			})
			.catch(e => alert('getUserMedia() error: ' + e.name));
		
		// var options = {
		// 	// videoStream: videoStream,//为了实现视频流切换
		// 	// audioStream: audioStream,
		// 	// sendSource: 'screen',
		// 	localVideo: video,
		// 	onicecandidate : onIceCandidate,
		// 	configuration: [{'urls': 'turn:helloturn.cn:3478', 'username': 'hellouser', 'credential': 'hellooo123'}]
		// }
	
		// webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, function(error) {
		// // webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeer('send', options, function(error) {
		// 	if(error) return onError(error);
	
		// 	this.generateOffer(onOfferPresenter);
		// });
	}
}

function onOfferPresenter(error, offerSdp) {
    if (error) return onError(error);

	var message = {
		id : 'presenter',
		sdpOffer : offerSdp
	};
	sendMessage(message);
}

function viewer() {
	if (!webRtcPeer) {
		showSpinner(video);

		var options = {
			remoteVideo: video,
			onicecandidate : onIceCandidate,
			configuration: [{'urls': 'turn:helloturn.cn:3478', 'username': 'hellouser', 'credential': 'hellooo123'}]
		}

		webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
			if(error) return onError(error);

			this.generateOffer(onOfferViewer);
		});
	}
}

function onOfferViewer(error, offerSdp) {
	if (error) return onError(error)

	var message = {
		id : 'viewer',
		sdpOffer : offerSdp
	}
	sendMessage(message);
}

function onIceCandidate(candidate) {
	   console.log('Local candidate' + JSON.stringify(candidate));

	   var message = {
	      id : 'onIceCandidate',
	      candidate : candidate
	   }
	   sendMessage(message);
}

function stop() {
	if (webRtcPeer) {
		endRecord();
		if(videoStream)
            videoStream.getTracks().forEach(e => e.stop());
        if(rtcStream)
            rtcStream.getTracks().forEach(e => e.stop());
        if(captureStream)
			captureStream.getTracks().forEach(e => e.stop());
		isPresenter = null;
		videoStream = null;
		rtcStream = null;
		captureStream = null;
		var message = {
			id : 'stop'
		}
		sendMessage(message);
		dispose();

		enableButton(CALLBtnId);
        enableButton(VIEWERBtnId);
        disableButton(TERMINATEBtnId);
        disableButton(RECORDBtnId);
        disableButton(ENDRECORDBtnId);
        disableButton(CAPTUREBtnId);
	}
}

function dispose() {
	if (webRtcPeer) {
		webRtcPeer.dispose();
		webRtcPeer = null;
	}
	hideSpinner(video);
}

/*
    录制媒体流相关函数
        - mediaRecorderInit(stream)
        - record()
        - endRecord()
 */
function mediaRecorderInit(stream){
    mediaRecorder = new MediaRecorder(stream);
    // mediaRecorder.mimeType = 'video/webm';
    // {video:true, audio:true}     - type: "video/x-matroska;codecs=avc1,opus"
    // {video:true, audio:false}    - type: "video/x-matroska;codecs=avc1"
    // {video:false, audio:true}    - type: "audio/webm;codecs=opus"

    mediaRecorder.ondataavailable = e => {
        console.log('ondataavailable fired')
        chunks.push(e.data);
        blobType = e.data.type;
        // console.log(e.data)
    }
    mediaRecorder.onstop = e => {
		isRecording = false;
		console.log('onstop fired')

		disableButton(ENDRECORDBtnId);
        enableButton(RECORDBtnId);
        
        var blob = new Blob(chunks, {'type': blobType});
        chunks = [];

        // 直接点击链接后由于页面刷新会导致 WebSocket断开连接，从而 Presenter下线
        // 因此在下载录制的媒体流时应当按住 Ctrl键再点击链接，以防掉线
        // Viewer端直接点击链接会找不到文件，也得先按住 Ctrl键
        var blobURL = URL.createObjectURL(blob);
        // console.log(blobURL);
        var content = document.createTextNode(blobURL);
        var aTag = document.createElement('a');
        var ttt = document.getElementById('ttt');
        aTag.href = blobURL;
        aTag.append(content);
        ttt.append(document.createElement('br'));
        ttt.append(aTag);
    }
}

function record(){
    if(webRtcPeer){
        isRecording = true;
        console.log('Start recording');
		mediaRecorder.start();
		console.log('Recording start time:', Date.now())

        disableButton(RECORDBtnId);
        enableButton(ENDRECORDBtnId);
    }
}

function endRecord(){
    if(isRecording === true){
        isRecording = false;
        console.log('Terminate recording');
        mediaRecorder.stop();
    }
}

function capture(){
	if(webRtcPeer && isPresenter === true){
		if(isCapturing === false){
			navigator.mediaDevices.getDisplayMedia(constraints)
                .then(stream => {
					captureStream = stream;
					videoStream.getTracks().forEach(track => videoStream.removeTrack(track));
    				captureStream.getTracks().forEach(track => videoStream.addTrack(track));
					isCapturing = true;
					var senderArray = pc.getSenders();
					senderArray.forEach(sender => {
						if(sender.dtmf){// sender.track.kind === 'audio'
							var audioTrack = videoStream.getAudioTracks()[0];
							if(audioTrack)
								sender.replaceTrack(audioTrack);
						}else{
							var videoTrack = videoStream.getVideoTracks()[0];
							if(videoTrack)
								sender.replaceTrack(videoTrack);
						}
					});
					console.log('Presenter got capture stream');
					console.log('Media stream switch to capture');
				})
                .catch(e => alert('getDisplayMedia() error: ' + e.name));
		}else{
            videoStream.getTracks().forEach(track => videoStream.removeTrack(track));
            rtcStream.getTracks().forEach(track => videoStream.addTrack(track));
			captureStream.getTracks().forEach(e => e.stop());
			var senderArray = pc.getSenders();
            senderArray.forEach(sender => {
                if(sender.dtmf){// sender.track.kind === 'audio'
                    var audioTrack = videoStream.getAudioTracks()[0];
                    if(audioTrack)
                        sender.replaceTrack(audioTrack);
                }else{
                    var videoTrack = videoStream.getVideoTracks()[0];
                    if(videoTrack)
                        sender.replaceTrack(videoTrack);
                }
            });
			isCapturing = false;
			captureStream = null;
			console.log('Media stream switch to camera');
		}
	}
}


function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('Sending message: ' + jsonMessage);
	ws.send(jsonMessage);
}

function showSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].poster = './img/transparent-1px.png';
		arguments[i].style.background = 'center transparent url("./img/spinner.gif") no-repeat';
	}
}

function hideSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].src = '';
		arguments[i].poster = './img/webrtc.png';
		arguments[i].style.background = '';
	}
}

/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
	event.preventDefault();
	$(this).ekkoLightbox();
});
