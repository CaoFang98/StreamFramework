var fs = require('fs');
// var privateKey = fs.readFileSync('./freessl/private.key', 'utf8');
// var certificate = fs.readFileSync('./freessl/full_chain.pem', 'utf8');
var privateKey = fs.readFileSync('keys/server.key');
var certificate = fs.readFileSync('keys/server.crt');
var credentials = {key: privateKey, cert: certificate};


var path = require('path');
var express = require('express');
var app = express();
// var server = require('http').Server(app);
var httpsServer = require('https').createServer(credentials, app);
var url = require('url');
var ws = require('ws');

var anc_ws = null;
var cur_aud_ws = null;
var aud_ws_array = [];
// var numClients = 0;
var idCounter = 0;

var as_uri = 'https://localhost:8080/'
// server.listen(80);
httpsServer.listen(8080, () => {
    console.log('Stream Transport Framework started');
    console.log('Open ' + url.format(as_uri) + ' with a WebRTC capable browser');
});

var wss = new ws.Server({
    // server:server
    server:httpsServer
});

function nextUniqueId() {
	idCounter++;
	return idCounter.toString();
}

function stringifiedMessage(message){
    return JSON.stringify(message);
}

wss.on('connection', ws => {
    // console.log('websocket connected!');
    var sessionId = nextUniqueId();
	console.log('Connection received with sessionId ' + sessionId);
    var isPresenter = false;

    ws.on('message', _message => {
        var message = JSON.parse(_message);
        console.log(message);

        switch(message.type){
            case 'create':
                if(!anc_ws){
                    ws.send(stringifiedMessage({
                        type:'createResponse',
                        state:'success'
                    }));
                    anc_ws = ws;
                    isPresenter = true;
                }
                else
                    ws.send(stringifiedMessage({
                        type:'createResponse',
                        state:'failed'
                    }));
                break;
            case 'join':
                if(!anc_ws)
                    ws.send(stringifiedMessage({
                        type:'joinResponse',
                        state:'failed',
                        numClients:0
                    }))
                else{
                    if(!cur_aud_ws){
                        cur_aud_ws = ws;
                        ws.send(stringifiedMessage({
                            type:'joinResponse',
                            state:'success'
                        }));
                        anc_ws.send(stringifiedMessage({
                            type:'ready'
                        }));
                        ws.send(stringifiedMessage({
                            type:'ready'
                        }));
                    }
                    else{
                        aud_ws_array.push(ws);
                        ws.send(stringifiedMessage({
                            type:'joinResponse',
                            state:'failed',
                            numClients:-1
                        }));
                    }
                }
                break;
            case 'offer':
                if(cur_aud_ws)
                    cur_aud_ws.send(stringifiedMessage(message));
                break;
            case 'answer':
                if(anc_ws)
                    anc_ws.send(stringifiedMessage(message));
                break;
            case 'candidate':
                if(message.from==='Presenter' && cur_aud_ws)
                    cur_aud_ws.send(stringifiedMessage(message));
                else if(anc_ws)
                    anc_ws.send(stringifiedMessage(message));
                break;
            case 'leave':
                if(message.from === 'Viewer'){
                    if(aud_ws_array.length > 0){
                        cur_aud_ws = aud_ws_array.shift();
                        anc_ws.send(stringifiedMessage({
                            type:'ready'
                        }));
                        cur_aud_ws.send(stringifiedMessage({
                            type:'ready'
                        }));
                    }else
                        cur_aud_ws = null;
                    // numClients++;
                }else
                    anc_ws = null;
                break;
            default:
                console.log('unrecognized message!' + message.type);
        }
    });

    ws.on('error', error => {
        console.log('Connection ' + sessionId + ' error');
    });

    ws.on('close', () => {
        console.log('Connection ' + sessionId + ' closed');
        if(isPresenter === true)
            anc_ws = null;
        // else
            // numClients--;
    });
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/static/index_pure.html');
});

app.use(express.static(path.join(__dirname, 'static')));