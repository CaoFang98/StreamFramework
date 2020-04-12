/*
var fs = require('fs');
var privateKey = fs.readFileSync('./freessl/private.key', 'utf8');
var certificate = fs.readFileSync('./freessl/full_chain.pem', 'utf8');
var credentials = {key: privateKey, cert: certificate};
*/

var path = require('path');
var express = require('express');
var app = express();
var server = require('http').Server(app);
//var httpsServer = require('https').createServer(credentials, app);

var ws = require('ws');

var anc_ws = null;
var cur_aud_ws = null;
var aud_ws_array = [];

server.listen(80);
//httpsServer.listen(443);
var wss = new ws.Server({
    server:server
    //server:httpsServer
});

function stringifiedMessage(message){
    return JSON.stringify(message);
}

wss.on('connection', ws => {
    console.log('websocket connected!');
    var isAnchorman = false;

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
                    isAnchorman = true;
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
                cur_aud_ws.send(stringifiedMessage(message));
                break;
            case 'answer':
                anc_ws.send(stringifiedMessage(message));
                break;
            case 'candidate':
                if(message.from==='anchorman')
                    cur_aud_ws.send(stringifiedMessage(message));
                else
                    anc_ws.send(stringifiedMessage(message));
                break;
            case 'leave':
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
                break;
            default:
                console.log('unrecognized message!' + message.type);
        }
    });

    ws.on('close', () => {
        if(isAnchorman===true)
            anc_ws = null;
    });
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/homepage.html');
});

app.use(express.static(path.join(__dirname, 'static')));