import RoomClient from './client/RoomClient.js';
import Y from './yjs.js';

/* const defaultIceServers = [
  {'urls': 'stun:stun.stunprotocol.org:3478'},
  {'urls': 'stun:stun.l.google.com:19302'},
]; */

const roomNumberStartIndex = '0'.charCodeAt(0);
const roomNumberEndIndex = '9'.charCodeAt(0)+1;
const roomAlphabetStartIndex = 'A'.charCodeAt(0);
const roomAlphabetEndIndex = 'Z'.charCodeAt(0)+1;
const roomIdLength = 4;
function makeId() {
  let result = '';
  for (let i = 0; i < roomIdLength; i++) {
    result += Math.random() < 0.5 ?
      String.fromCharCode(roomNumberStartIndex + Math.floor(Math.random() * (roomNumberEndIndex - roomNumberStartIndex)))
    :
      String.fromCharCode(roomAlphabetStartIndex + Math.floor(Math.random() * (roomAlphabetEndIndex - roomAlphabetStartIndex)));
  }
  return result;
}

class XRChannelConnection extends EventTarget {
  constructor(url, options = {}) {
    super();

    this.connectionId = makeId();
    this.peerConnections = [];
    // this.dataChannel = null;
    // this.open = true;

    // console.log('local connection id', this.connectionId);

    const _getPeerConnectionIndex = peerConnectionId => this.peerConnections.findIndex(peerConnection => peerConnection.connectionId === peerConnectionId);
    const _getPeerConnection = peerConnectionId => {
      const index = _getPeerConnectionIndex(peerConnectionId);
      const peerConnection = this.peerConnections[index];
      return peerConnection;
    };
    const _addPeerConnection = peerConnectionId => {
      let peerConnection = _getPeerConnection(peerConnectionId);
      if (!peerConnection) {
        peerConnection = new XRPeerConnection(peerConnectionId, this);
        peerConnection.numStreams = 0;
        this.peerConnections.push(peerConnection);
        this.dispatchEvent(new MessageEvent(peerConnectionId ? 'peerconnection' : 'botconnection', {
          data: peerConnection,
        }));
      }
      peerConnection.numStreams++;
      return peerConnection;
    };
    /* const _removePeerConnection = peerConnectionId => {
      const index = this.peerConnections.findIndex(peerConnection => peerConnection.connectionId === peerConnectionId);
      if (index !== -1) {
        this.peerConnections.splice(index, 1)[0].close();
      } else {
        console.warn('no such peer connection', peerConnectionId, this.peerConnections.map(peerConnection => peerConnection.connectionId));
      }
    }; */

    const {roomName = 'room'} = options;
    const dialogClient = new RoomClient({
      url: `${url}?roomId=${roomName}&peerId=${this.connectionId}`
    });
    /* dialogClient.addEventListener('addsend', async e => {
      const {data: {dataProducer: {id, _dataChannel}}} = e;
      // console.log('add send', _dataChannel);
      if (_dataChannel.readyState !== 'open') {
        await new Promise((accept, reject) => {
          const _open = e => {
            accept();

            _dataChannel.removeEventListener('open', _open);
          };
          _dataChannel.addEventListener('open', _open);
        });
      }
      this.dataChannel = _dataChannel;

      this.dispatchEvent(new MessageEvent('open', {
        data: {},
      }));
    });
    dialogClient.addEventListener('removesend', e => {
      const {data: {dataProducer: {id, _dataChannel}}} = e;
      // console.log('remove send', _dataChannel);
      this.dataChannel = null;
    }); */
    dialogClient.addEventListener('newPeer', e => {
      const {id: peerId} = e.data;
      const peerConnection = _addPeerConnection(peerId);
    });
    dialogClient.addEventListener('peerClosed', e => {
      const {peerId} = e.data;
      const peerConnection = this.peerConnections.find(peerConnection => peerConnection.connectionId === peerId);
      // console.log('peer closed', e.data, peerId, peerConnection);
      if (peerConnection) {
        if (--peerConnection.numStreams <= 0) {
          peerConnection.close();
          this.peerConnections.splice(this.peerConnections.indexOf(peerConnection), 1);
        } /* else {
          console.warn('keeping disconnected peer due to existing streams', peerConnection, peerConnection.numStreams);
        } */
      } else {
        console.warn('cannot find peer connection', peerConnection);
      }
    });
    /* dialogClient.addEventListener('addreceive', e => {
      console.log('got recv', e);
    }); */
    /* dialogClient.addEventListener('addreceive', e => {
      const {data: {peerId, label, dataConsumer: {id, _dataChannel}}} = e;
      // console.log('add data receive', peerId, label, _dataChannel);
      const peerConnection = _addPeerConnection(peerId);
      _dataChannel.addEventListener('message', e => {
        const {data} = e;
        peerConnection.dispatchEvent(new MessageEvent('message', {
          data,
        }));
      });
      _dataChannel.addEventListener('close', e => {
        console.warn('data channel close', e);
        // this.dataChannel = null;
        if (--peerConnection.numStreams <= 0) {
          peerConnection.close();
          this.peerConnections.splice(this.peerConnections.indexOf(peerConnection), 1);
        }
      });
    }); */
    dialogClient.addEventListener('addreceivestream', e => {
      const {data: {peerId, consumer: {id, _track}}} = e;
      // console.log('add receive stream', peerId, _track);
      const peerConnection = _addPeerConnection(peerId);
      peerConnection.dispatchEvent(new MessageEvent('addtrack', {
        data: _track,
      }));
      _track.stop = (stop => function () {
        const {readyState} = _track;
        const result = stop.apply(this, arguments);
        if (readyState === 'live') {
          this.dispatchEvent(new MessageEvent('ended'));
        }
        return result;
      })(_track.stop);
      _track.addEventListener('ended', e => {
        // console.warn('receive stream ended', e);

        if (--peerConnection.numStreams <= 0) {
          peerConnection.close();
          this.peerConnections.splice(this.peerConnections.indexOf(peerConnection), 1);
        } /* else {
          console.warn('keeping closed stream peer peer due to existing streams', peerConnection, peerConnection.numStreams);
        } */
      });
    });
    /* [
      'initState',
      'updateState',
    ].forEach(m => {
      dialogClient.addEventListener(m, e => {
        this.dispatchEvent(new MessageEvent(m, {
          data: e.data,
        }));
      });
    }); */
    (async () => {
      await dialogClient.join();
      await dialogClient.enableChatDataProducer();
      // await dialogClient.enableMic();
      // await dialogClient.enableWebcam();
    })();
    this.dialogClient = dialogClient;

    this.state = new Y.Doc();
    dialogClient._protoo._transport._ws.binaryType = 'arraybuffer';
    dialogClient._protoo._transport._ws.addEventListener('open', () => {
      dialogClient._protoo._transport._ws.addEventListener('message', e => {
        if (e.data instanceof ArrayBuffer) {
          Y.applyUpdate(this.state, new Uint8Array(e.data));
        } /* else {
          console.log('got data', e.data);
        } */
      });
      /* dialogClient._protoo._transport._ws.addEventListener('close', () => {
        this.state.off('update', _update);
      }); */
      const _update = b => {
        if (dialogClient._protoo._transport._ws.readyState === WebSocket.OPEN) {
          dialogClient._protoo._transport._ws.send(b);
        }
      };
      this.state.on('update', _update);
    });
    ['status', 'pose', 'chat'].forEach(eventType => {
      dialogClient.addEventListener(eventType, e => {
        const peerConnection = _getPeerConnection(e.data.peerId) || _addPeerConnection(e.data.peerId);
        peerConnection.dispatchEvent(new MessageEvent(e.type, {
          data: e.data,
        }));
      });
    });
  }

  /* setState(key, value) {
    this.dialogClient.setState(key, value);
  }

  deleteState(key) {
    this.dialogClient.deleteState(key);
  } */

  close() {
    // this.open = false;
    this.dialogClient.close();
  }

  /* disconnect() {
    this.rtcWs.close();
    this.rtcWs = null;

    for (let i = 0; i < this.peerConnections.length; i++) {
      this.peerConnections[i].close();
    }
    this.peerConnections.length = 0;
  } */

  send(s) {
    if (this.dialogClient._protoo._transport._ws.readyState === WebSocket.OPEN) {
      this.dialogClient._protoo._transport._ws.send(s);
    }
  }
  
  async setMicrophoneMediaStream(mediaStream) {
    if (mediaStream) {
      await this.dialogClient.enableMic(mediaStream);
    } else {
      await this.dialogClient.disableMic();
    }
  }
}

class XRPeerConnection extends EventTarget {
  constructor(peerConnectionId, channelConnection) {
    super();

    this.connectionId = peerConnectionId;
    this.channelConnection = channelConnection;
    // this.open = true;
  }
  close() {
    // this.open = false;
    this.dispatchEvent(new MessageEvent('close', {
      data: {},
    }));
  }
}

export {
  makeId,
  XRChannelConnection,
  XRPeerConnection,
};