var video;
var rtcStream, captureStream;
var videoStream;
var mediaRecorder;
var blobType;
var chunks = [];    //存放记录的流数据
// var addTrackDict = [];
var isPresenter = null;
var isRecording = false;
var isCapturing = false;
var constraints = {
    video: true,
    audio: true
};

// pcArray用于 Presenter存储与所有 Viewer建立的 RTCPeerConnection
var pcArray = [];
var pc = null;
// var dc = null;
var pcConfig = {
    'iceServers':[
    {
        'urls': 'turn:helloturn.cn:3478',
        'username': 'hellouser',
        'credential': 'hellooo123'
    }]
};

var lastResult;

var room = 'room';
var ws = new WebSocket('wss://' + location.host);

// var callButton, viewerButton, terminateButton;
// var recordButton, endRecordButton, captureButton;
const CALLBtnId = 'call', VIEWERBtnId = 'viewer', TERMINATEBtnId = 'terminate',
    RECORDBtnId = 'record', ENDRECORDBtnId = 'endRecord', CAPTUREBtnId = 'captureScreen';
const CONNECTIONCOUNTTagId = 'connCnt', BANDWIDTHTagId = 'bandwidth';

var count = 0;
function nextID(){
    count++;
    return count;
}

function disableButton(btnId){
    document.getElementById(btnId).disabled = true;
}

function enableButton(btnId){
    document.getElementById(btnId).disabled = false;
}

function showBitrate(connCnt, bitrate){
    if(connCnt !== null){// Presenter
        var connCntTag = document.getElementById(CONNECTIONCOUNTTagId);
        var meanBitrateTag = document.getElementById(BANDWIDTHTagId);
        connCntTag.style.cssText = "font-size: large;float: right;margin-top: -10px;";
        meanBitrateTag.style.cssText = "font-size: large;float: right;clear: right;margin-top: -15px;";
        connCntTag.innerText = 'Connection Count: ' + connCnt;
        meanBitrateTag.innerText = 'Mean Video Bandwidth: ' + bitrate.toString() + ' kbps';
    }else{// Viewer
        var bitrateTag = document.getElementById(BANDWIDTHTagId);
        bitrateTag.style.cssText = "font-size: large;float: right;clear: right;";
        bitrateTag.innerText = 'Video Bandwidth: ' + bitrate.toString() + ' kbps';
    }
}

function clearBitrate(){
    document.getElementById(CONNECTIONCOUNTTagId).innerText = '';
    document.getElementById(BANDWIDTHTagId).innerText = '';
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
    // callButton = document.getElementById('call');
    // viewerButton = document.getElementById('viewer');
    // terminateButton = document.getElementById('terminate');
    // recordButton = document.getElementById('record');
    // endRecordButton = document.getElementById('endRecord');

    disableButton(TERMINATEBtnId);
    disableButton(RECORDBtnId);
    disableButton(ENDRECORDBtnId);
    disableButton(CAPTUREBtnId);
}

window.setInterval(() => {
    if(isPresenter === true){
        var meanBitrate = 0;
        var len = Object.keys(pcArray).length;
        var pcCnt = 0;
        pcArray.forEach(item => {
            // pcCnt += 1;
            var id = item.pcid;
            var pc = item.pc;
            var lastResult = item.lastResult;
            pc.getSenders().forEach(sender => {
                if(!sender.dtmf){
                    // console.log(sender);
                    sender.getStats().then(res => {//原来是异步编程的问题!!! then...
                        res.forEach(report => {
                            // console.log(report);
                            if(report.type === 'outbound-rtp'){
                                if(report.isRemote)
                                    return;
                                pcCnt++;
                                const now = report.timestamp;
                                const bytes = report.bytesSent;
                                if(lastResult && lastResult.has(report.id)){
                                    const bitrate = 8*(bytes-lastResult.get(report.id).bytesSent)/
                                        (now-lastResult.get(report.id).timestamp);
                                    // console.log(bitrate + ' kbps');
                                    meanBitrate += bitrate;
                                    // console.log(bitrate, meanBitrate);
                                }
                                // console.log(len, pcCnt, meanBitrate);
                                if(pcCnt === len && pcCnt){
                                    // pcCnt            当前 RTCPeerConnection总数
                                    // totalBitrate     总比特率
                                    // meanBitrate      平均比特率
                                    var totalBitrate = meanBitrate;
                                    meanBitrate = meanBitrate/pcCnt;
                                    if(meanBitrate)
                                        // document.getElementById('connCnt').innerText = 
                                        //     'Connection Count: ' + len;
                                        // document.getElementById(BANDWIDTHTagId).innerText = 
                                        //     // 'Connection Count: ' + len + ' '
                                        //     'Mean Video Bandwidth: ' + meanBitrate.toString() + ' kbps';
                                        showBitrate(len, meanBitrate);
                                }
                            }
                            // console.log('1 ' + meanBitrate);
                        });
                        pcArray[id].lastResult = res;
                        // console.log('2 ' + meanBitrate);//此时的 meanBitrate仍为正常值
                        // console.log(pcArray[id]);
                    });
                    // console.log('3 ' + meanBitrate);//此时的 meanBitrate已经变成了 0
                }
            });
        });
        if(!len)
            showBitrate(0, 0);
        // console.log(pcCnt, meanBitrate);
        // if(pcCnt)
        //     meanBitrate = meanBitrate/pcCnt;
        // if(meanBitrate)
        //     document.getElementById('bandwidth').innerText = 
        //         'Mean Video Bandwidth: ' + meanBitrate.toString() + ' kbps';
    }
    else if(isPresenter === false && pc){
        pc.getReceivers().forEach(receiver => {
            // console.log(receiver);
            if(receiver.track.kind === 'video'){
                receiver.getStats().then(res => {
                    res.forEach(report => {
                        // console.log(report);
                        if(report.type === 'inbound-rtp'){
                            if(report.isRemote)
                                return;
                            // console.log(report);
                            const now = report.timestamp;
                            const bytes = report.bytesReceived;
                            if(lastResult && lastResult.has(report.id)){
                                const bitrate = 8*(bytes-lastResult.get(report.id).bytesReceived)/
                                    (now-lastResult.get(report.id).timestamp);
                                // console.log(bitrate + ' kbps');
                                // document.getElementById(BANDWIDTHTagId).innerText = 
                                //     'Video Bandwidth: ' + bitrate.toString() + ' kbps';
                                showBitrate(null, bitrate);
                            }
                        }
                    });
                    lastResult = res;
                });
            }
        });
        // console.log('---')
    }
}, 1000);

window.onbeforeunload = function() {
	ws.close();
}

ws.onmessage = _message => {
    var message = JSON.parse(_message.data);
    console.info('Received message: ' + _message.data);

    switch(message.type){
        case 'createResponse':
            if(message.state==='success'){
                isPresenter = true;

                disableButton(VIEWERBtnId);
                enableButton(TERMINATEBtnId);
                enableButton(RECORDBtnId);
                enableButton(CAPTUREBtnId);
                
                console.log('Created room ' + room);
                navigator.mediaDevices.getUserMedia(constraints)
                    .then(gotRTCStream).catch(e => alert('getUserMedia() error: ' + e.name));
                // navigator.mediaDevices.getDisplayMedia(constraints)
                    // .then(gotStream).catch(e => alert('getUserMedia() error: ' + e.name));

            }
            else{
                // console.log('Room ' + room + ' is unavailable');
                hideSpinner(video);
                console.log('Another user is currently acting as presenter. Try again later ...');
                stop();
            }
            break;
        case 'joinResponse':
            if(message.state==='success'){
                isPresenter = false;
                console.log('Joined: ' + room);
                
                disableButton(CALLBtnId);
                enableButton(TERMINATEBtnId);
                enableButton(RECORDBtnId);
            }
            else{
                hideSpinner(video);
                if(message.numClients===0)
                    // console.log('Presenter is not online');
                    console.log('No active presenter. Try again later...');
                else
                    console.log('Another one is connecting with Presenter, please wait...');
                stop();
            }
            break;
        case 'ready':
            if(isPresenter===true)
                presenterReady();
            else if(isPresenter===false)
                viewerReady();
            else
                console.error('Role unknown');
            break;
        case 'offer':
            offer(message);
            break;
        case 'answer':
            answer(message);
            break;
        case 'candidate':
            candidate(message);
            break;
        default:
            console.error('Unrecognized message:' + message);
            break;
    }
}

/*
    传输媒体流相关函数，与按钮相对应
        - presenter()
        - viewer()
        - stop()
 */
function presenter() {
    if(isPresenter === null){
        // isPresenter = true;
        showSpinner(video);
        sendMessage({
            type:'create',
            room:room
        });
        console.log('Presenter attempted to create room ', room);
    }
}

function viewer() {
    if(isPresenter === null){
        // isPresenter = false;
        showSpinner(video);
        sendMessage({
            type:'join',
            room:room
        });
        console.log('Viewer attempted to join room ', room);
    }
}

function stop() {
    if(isPresenter !== null){
        endRecord();
        if(isPresenter === true){
            sendMessage({type:'leave', from:'Presenter'});
        }
        if(videoStream)
            videoStream.getTracks().forEach(e => e.stop());
        if(rtcStream)
            rtcStream.getTracks().forEach(e => e.stop());
        if(captureStream)
            captureStream.getTracks().forEach(e => e.stop());
        if(pc)
            pc.close();
        pcArray.forEach(e => {
            if(e.pc)
                e.pc.close()
        });
        isPresenter = null;
        videoStream = null;
        rtcStream = null;
        captureStream = null;
        pc = null;
        pcArray = [];
        hideSpinner(video);
        // document.getElementById(BANDWIDTHTagId).innerText = '';
        clearBitrate();

        enableButton(CALLBtnId);
        enableButton(VIEWERBtnId);
        disableButton(TERMINATEBtnId);
        disableButton(RECORDBtnId);
        disableButton(ENDRECORDBtnId);
        disableButton(CAPTUREBtnId);
    }
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

    //Presenter端当切换源时会触发ondataavailabe，Viewer端不受影响
    mediaRecorder.ondataavailable = e => {
        console.log('ondataavailable fired')
        chunks.push(e.data);
        // console.log(e.data.type);
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

        // 使用JavaScript保存文件是不可行的……只能让用户自己去下载……？
        // console.log(blob);
        // console.log(os.homedir())
        // var reader = new FileReader();
        // reader.onload = () => {
            // var buffer = new Buffer(reader.result);
            // var fileName = Date.now() + '.mkv';
            // fs.writeFile(fileName, buffer, {}, (err, res) => {
            //     console.error(err);
            // });
            // alert('Record saved');
        // }
        // reader.readAsArrayBuffer(blob);
    }
}

function record(){
    if(isPresenter !== null){
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
        // disableButton(ENDRECORDBtnId);
        // enableButton(RECORDBtnId);
    }
}

function capture(){
    if(isPresenter === true){
        if(isCapturing === false){
            navigator.mediaDevices.getDisplayMedia(constraints)
                .then(gotCaptureStream)
                .then(() => {
                    isCapturing = true;
                    pcArray.forEach(async e => {
                        var epc = e.pc;
                        if(epc){
                            var eid = e.pcid;
                            var senderArray = epc.getSenders();
                            // senderArray.forEach(s => console.log(s));
                            console.log('RTCPeerConnection ', eid, ' switch to capture');
                            senderArray.forEach(sender => {
                                if(sender.dtmf){// sender.track.kind === 'audio'
                                    var audioTrack = videoStream.getAudioTracks()[0];
                                    // console.log(audioTrack);
                                    if(audioTrack)
                                        sender.replaceTrack(audioTrack);
                                    // else
                                    //     epc.removeTrack(sender);
                                }else{
                                    var videoTrack = videoStream.getVideoTracks()[0];
                                    // console.log(videoTrack);
                                    if(videoTrack)
                                        sender.replaceTrack(videoTrack);
                                    // else
                                    //     epc.removeTrack(sender);
                                }
                            });
                            // epc.getSenders().forEach(s => console.log(s));
                        }
                    });
                    // pcArray.forEach(async e => {
                    //     var epc = e.pc;
                    //     if(epc){
                    //         var eid = e.pcid;
                    //         var edc = e.dc;
                    //         var senderArray = epc.getSenders();
                    //         senderArray.forEach(sender => epc.removeTrack(sender));
                    //         edc.send(JSON.stringify({'type':'removeTracks'}));
                    //         console.log('Presenter channel ', eid, ' send removeTracks message');
                    //         // while(!addTrackDict[eid]);// 致命写法……OTZ
                    //         // videoStream.getTracks().forEach(track => {
                    //         //     epc.addTrack(track, videoStream);
                    //         // });
                    //         // console.log('Presenter channel ', eid, 'addTrack function complete');
                    //     }
                    // });
                })
                .catch(e => alert('getDisplayMedia() error: ' + e.name));
        }else{
            isCapturing = false;
            // videoStream = rtcStream;
            // video.srcObject = videoStream;
            videoStream.getTracks().forEach(track => videoStream.removeTrack(track));
            rtcStream.getTracks().forEach(track => videoStream.addTrack(track));
            captureStream.getTracks().forEach(e => e.stop());
            captureStream = null;
            pcArray.forEach(async e => {
                var epc = e.pc;
                if(epc){
                    var eid = e.pcid;
                    var senderArray = epc.getSenders();
                    // senderArray.forEach(s => console.log(s));
                    console.log('RTCPeerConnectin ', eid, ' switch to camera');
                    senderArray.forEach(sender => {
                        if(sender.dtmf){// sender.track.kind === 'audio'
                            var audioTrack = videoStream.getAudioTracks()[0];
                            // console.log(audioTrack);
                            if(audioTrack)
                                sender.replaceTrack(audioTrack);
                            // else
                            //     epc.removeTrack(sender);
                        }else{
                            var videoTrack = videoStream.getVideoTracks()[0];
                            // console.log(videoTrack);
                            if(videoTrack)
                                sender.replaceTrack(videoTrack);
                            // else
                            //     epc.removeTrack(sender);
                        }
                    });
                    // epc.getSenders().forEach(s => console.log(s));
                }
            });
        }
    }
}

function gotRTCStream(stream){
    rtcStream = stream;
    // videoStream = rtcStream;
    videoStream = new MediaStream();
    rtcStream.getTracks().forEach(track => videoStream.addTrack(track));
    video.srcObject = videoStream;
    mediaRecorderInit(videoStream);

    console.log('Presenter got rtc stream');
}

function gotCaptureStream(stream){
    captureStream = stream;
    // videoStream = captureStream;
    // video.srcObject = videoStream;
    videoStream.getTracks().forEach(track => videoStream.removeTrack(track));
    captureStream.getTracks().forEach(track => videoStream.addTrack(track));
    console.log('Presenter got capture stream');
}

/*
    信令过程相关函数：
        - presenterReady()
        - viewerReady()
        - onCreateOffer()
        - onCreateAnswer()
        - offer()
        - answer()
        - candidate()
        - sendMessage()
 */
function presenterReady(){
    console.log('Presenter ready!');
    var id = nextID();

    pc = new RTCPeerConnection(pcConfig);
    // dc = pc.createDataChannel('channel ' + id.toString());
    // addTrackDict[id] = false;
    // console.log(addTrackDict[id]);
    videoStream.getTracks().forEach(track => {
        pc.addTrack(track, videoStream);
    });

    pc.onicecandidate = event => {
        if(event.candidate){
            sendMessage({
                type: 'candidate',
                from: 'Presenter',
                lable: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            });
        }else{
            console.log('End of candidates');
        }
    };

    pc.onconnectionstatechange = event => {
        if(pc.connectionState === 'connected'){
            console.log('Presenter: RTCPeerConnection successfully setup!');
            // pcArray[id] = {'pcid': id, 'pc': pc, 'dc': dc};
            pcArray[id] = {'pcid': id, 'pc': pc, 'lastResult': null};
            //pc = null;
        }
        else if(pc.connectionState === 'disconnected'||pc.connectionState === 'closed'
            ||pc.connectionState === 'failed'){
            // if(pcArray[id])
                delete pcArray[id];
        }
    };

    pc.createOffer().then(onCreateOffer)
        .catch(e => console.log('Some error occured'));

    // dc.onmessage = event => {
    //     console.log('Presenter channel ' + id.toString() + ' received: ' + event.data);
    //     var message = JSON.parse(event.data);
    //     if(message.type === 'complete'){
    //         // addTrackDict[id] = true;
    //         // console.log(addTrackDict[id]);
    //         var e = pcArray[id];
    //         if(e){
    //             var epc = e.pc;
    //             epc.getSenders().forEach(s => console.log(s));
    //             videoStream.getTracks().forEach(track => {
    //                 console.log('epc addTrack');
    //                 epc.addTrack(track, videoStream);
    //                 // epc.addTrack(track);
    //             });
    //             console.log('Presenter channel ', id, ' addTrack function complete');
    //             epc.getSenders().forEach(s => console.log(s));
    //         }   
    //     }
    // };
}

function viewerReady(){
    console.log('Viewer ready!');

    pc = new RTCPeerConnection(pcConfig);
    videoStream = new MediaStream();
    mediaRecorderInit(videoStream);

    pc.onicecandidate = event => {
        if(event.candidate){
            sendMessage({
                type: 'candidate',
                from: 'Viewer',
                lable: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            });
        }else{
            console.log('End of candidates');
        }
    }

    pc.ontrack = async (event) => {
        // hideSpinner(video);
        console.log('Viewer: ontrack callback function called');
        videoStream.addTrack(event.track);
    };

    // pc.onremovetrack = (event) => {
        // console.log('Viewer: onremovetrack callback function called');
        // videoStream.removeTrack(event.track);
    // }
    
    //pc.addEventListener('track', async event => {
    //    console.log('Viewer: ontrack callback function called');
    //    remoteStream.addTrack(event.track);
    //});

    pc.onconnectionstatechange = event => {
        if(pc.connectionState === 'connected'){
            console.log('Viewer: RTCPeerConnection successfully setup!');
            video.srcObject = videoStream;
            //console.log('Viewer ' + socket.id + ' is leaving room ' + room);
            //socket.emit('leave', room);
            sendMessage({type:'leave', from:'Viewer'});
            // videoStream.getTracks().forEach(t => console.log(t));
        }
        else if(pc.connectionState === 'disconnected' || pc.connectionState === 'failed'
            || pc.connectionState === 'closed'){
            isPresenter = null;
            pc = null;
            hideSpinner(video);
            // document.getElementById(BANDWIDTHTagId).innerText = '';
            clearBitrate();

            enableButton(CALLBtnId);
            enableButton(VIEWERBtnId);
            disableButton(TERMINATEBtnId);
            disableButton(RECORDBtnId);
            disableButton(ENDRECORDBtnId);
            disableButton(CAPTUREBtnId);     
        }
    };

    // pc.ondatachannel = event => {
    //     var ch = event.channel;
    //     ch.onopen = event => console.log('Viewer datachannel opened');
    //     ch.onmessage = event => {
    //         console.log('Viewer channel recevied: ' + event.data);
    //         var message = JSON.parse(event.data);
    //         if(message.type === 'removeTracks'){
    //             var senderArray = pc.getSenders();
    //             senderArray.forEach(sender => console.log(sender));
    //             var receiverArray = pc.getReceivers();
    //             receiverArray.forEach(r => console.log(r));
    //             console.log('emmm')
    //             // senderArray.forEach(sender => pc.removeTrack(sender));
    //             // receiverArray.forEach(r => removeTrack(r));
    //             var tracks = videoStream.getTracks();
    //             tracks.forEach(t => videoStream.removeTrack(t));

    //             pc.getSenders().forEach(s => console.log(s));
    //             pc.getReceivers().forEach(r => console.log(r));

    //             ch.send(JSON.stringify({'type':'complete'}));
    //             console.log('Viewer channel send complete message');
    //         }
    //     };
    // };
}

function onCreateOffer(desc){
    pc.setLocalDescription(desc, () => {
        sendMessage({
            type:'offer',
            content:pc.localDescription
        });
    });
}

function onCreateAnswer(desc){
    pc.setLocalDescription(desc, () => {
        sendMessage({
            type:'answer',
            content:pc.localDescription
        });
    });
}

function offer(message){
    console.log('Got offer. Sending answer to peer');
    pc.setRemoteDescription(new RTCSessionDescription(message.content));
    pc.createAnswer().then(onCreateAnswer)
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