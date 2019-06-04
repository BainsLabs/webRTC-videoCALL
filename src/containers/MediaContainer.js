import React, { Component } from "react";
import { PropTypes } from "prop-types";
import VideoStreamMerger from "video-stream-merger";
let mediaRecorder;

class MediaBridge extends Component {
  constructor(props) {
    super(props);
    this.state = {
      bridge: "",
      user: "",
      localStreamss: "",
      remoteStreamss: ""
    };
    this.onRemoteHangup = this.onRemoteHangup.bind(this);
    this.handleRemoteData = this.handleRemoteData.bind(this);
    this.handleDataAvailable = this.handleDataAvailable.bind(this);
    this.onMessage = this.onMessage.bind(this);
    this.sendData = this.sendData.bind(this);
    this.setupDataHandlers = this.setupDataHandlers.bind(this);
    this.setDescription = this.setDescription.bind(this);
    this.sendDescription = this.sendDescription.bind(this);
    this.hangup = this.hangup.bind(this);
    this.init = this.init.bind(this);
    this.setDescription = this.setDescription.bind(this);
  }
  static _startScreenCapture() {
    if (navigator.getDisplayMedia) {
      return navigator.getDisplayMedia({ video: true });
    } else if (navigator.mediaDevices.getDisplayMedia) {
      return navigator.mediaDevices.getDisplayMedia({ video: true });
    } else {
      return navigator.mediaDevices.getUserMedia({
        video: { mediaSource: "screen" }
      });
    }
  }
  componentWillMount() {
    window.recordedlocalBlobs = [];
    window.recordedRemoteBlobs = [];
    // chrome polyfill for connection between the local device and a remote peer
    window.RTCPeerConnection =
      window.RTCPeerConnection || window.webkitRTCPeerConnection;
    this.props.media(this);
  }
  componentDidMount() {
    this.props.getUserMedia.then(stream => {
      this.localVideo.srcObject = this.localStream = stream;
      this.setState({
        localStreamss: stream
      });
    });
    this.props.socket.on("message", this.onMessage);
    this.props.socket.on("hangup", this.onRemoteHangup);
  }
  // componentWillUnmount() {
  //   this.props.media(null);
  //   if (this.localStream !== undefined) {
  //     this.localStream.getVideoTracks()[0].stop();
  //   }
  //   this.props.socket.emit("leave");
  // }
  onRemoteHangup() {
    this.setState({ user: "host", bridge: "host-hangup" });
  }
  onMessage(message) {
    if (message.type === "offer") {
      // set remote description and answer
      this.pc.setRemoteDescription(new RTCSessionDescription(message));
      this.pc
        .createAnswer()
        .then(this.setDescription)
        .then(this.sendDescription)
        .catch(this.handleError); // An error occurred, so handle the failure to connect
    } else if (message.type === "answer") {
      // set remote description
      this.pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === "candidate") {
      // add ice candidate
      this.pc.addIceCandidate(
        new RTCIceCandidate({
          sdpMLineIndex: message.mlineindex,
          candidate: message.candidate
        })
      );
    }
  }
  sendData(msg) {
    this.dc.send(JSON.stringify(msg));
  }
  // Set up the data channel message handler
  setupDataHandlers() {
    this.dc.onmessage = e => {
      var msg = JSON.parse(e.data);
      console.log("received message over data channel:" + msg);
    };
    // this.dc.onclose = () => {
    //   this.remoteStream.getVideoTracks()[0].stop();
    //   console.log("The Data Channel is Closed");
    // };
  }
  setDescription(offer) {
    this.pc.setLocalDescription(offer);
  }
  // send the offer to a server to be forwarded to the other peer
  sendDescription() {
    this.props.socket.send(this.pc.localDescription);
  }
  hangup() {
    console.log("Stop capturing.");
    this.status = "Screen recorded completed.";
    this.enableStartCapture = false;
    this.enableStopCapture = true;
    this.enableDownloadRecording = true;

    this.mediaRecorder.stop();
    this.mediaRecorder = null;
    this.stream.getTracks().forEach(track => track.stop());
    this.stream = null;

    this.setState({ user: "guest", bridge: "guest-hangup" });
    this.pc.close();

    const blob = new Blob(window.recordedlocalBlobs, { type: "video/webm" });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = "test.webm";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
    // const blob2 = new Blob(window.recordedRemoteBlobs, { type: "video/webm" });
    // const url2 = window.URL.createObjectURL(blob2);
    // const a2 = document.createElement("a");
    // a2.style.display = "none";
    // a2.href = url2;
    // a2.download = "test2.webm";
    // document.body.appendChild(a2);
    // a2.click();
    // setTimeout(() => {
    //   document.body.removeChild(a2);
    //   window.URL.revokeObjectURL(url2);
    // }, 100);
    this.props.socket.emit("leave");
  }
  handleError(e) {
    console.log(e);
  }
  async init() {
    // wait for local media to be ready
    const attachMediaIfReady = () => {
      this.dc = this.pc.createDataChannel("chat");
      this.setupDataHandlers();
      console.log("attachMediaIfReady");
      this.pc
        .createOffer()
        .then(this.setDescription)
        .then(this.sendDescription)
        .catch(this.handleError); // An error occurred, so handle the failure to connect
    };
    // set up the peer connection
    // this is one of Google's public STUN servers
    // make sure your offer/answer role does not change. If user A does a SLD
    // with type=offer initially, it must do that during  the whole session
    this.pc = new RTCPeerConnection({
      iceServers: [{ url: "stun:stun.l.google.com:19302" }]
    });
    // when our browser gets a candidate, send it to the peer
    this.pc.onicecandidate = e => {
      console.log("MediaRecorder started", mediaRecorder);
      console.log(e, "onicecandidate");
      if (e.candidate) {
        this.props.socket.send({
          type: "candidate",
          mlineindex: e.candidate.sdpMLineIndex,
          candidate: e.candidate.candidate
        });
      }
    };
    // when the other side added a media stream, show it on screen
    this.pc.onaddstream = e => {
      console.log("onaddstream", e);
      this.remoteStream = e.stream;
      this.remoteVideo.srcObject = this.remoteStream = e.stream;
      this.setState({ bridge: "established" });
      this.remoteStream
        .getTracks()
        .forEach(track => this.pc.addTrack(track, this.remoteStream));

      mediaRecorder.ondataavailable = this.handleRemoteData;
      mediaRecorder.start(10);
    };
    this.pc.ondatachannel = e => {
      // data channel
      this.dc = e.channel;
      this.setupDataHandlers();
      this.sendData({
        peerMediaStream: {
          video: this.localStream.getVideoTracks()[0].enabled
        }
      });
      //sendData('hello');
    };
    // attach local media to the peer connection
    this.localStream
      .getTracks()
      .forEach(track => this.pc.addTrack(track, this.localStream));
    // call if we were the last to connect (to increase
    // chances that everything is set up properly at both ends)
    let recording = null;

    console.log("Start capturing.");
    this.status = "Screen recording started.";
    this.enableStartCapture = false;
    this.enableStopCapture = true;
    this.enableDownloadRecording = false;

    if (this.recording) {
      window.URL.revokeObjectURL(this.recording);
    }

    this.chunks = [];
    this.recording = null;
    this.stream = await MediaBridge._startScreenCapture();
    this.stream.addEventListener("inactive", e => {
      this._stopCapturing(e);
    });
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: "video/webm"
    });
    this.mediaRecorder.addEventListener("dataavailable", event => {
      if (event.data && event.data.size > 0) {
        window.recordedlocalBlobs.push(event.data);
      }
    });
    this.mediaRecorder.start(10);
    if (this.state.user === "host") {
      this.props.getUserMedia.then(attachMediaIfReady);
    }
  }

  handleRemoteData(event) {
    if (event.data && event.data.size > 0) {
      window.recordedRemoteBlobs.push(event.data);
    }
  }

  handleDataAvailable(event) {
    if (event.data && event.data.size > 0) {
    }
  }
  render() {
    return (
      <div className={`media-bridge ${this.state.bridge}`}>
        <video
          className="remote-video"
          ref={ref => (this.remoteVideo = ref)}
          autoPlay
        />
        <video
          className="local-video"
          ref={ref => (this.localVideo = ref)}
          autoPlay
        />
      </div>
    );
  }
}
MediaBridge.propTypes = {
  socket: PropTypes.object.isRequired,
  getUserMedia: PropTypes.object.isRequired,
  media: PropTypes.func.isRequired
};
export default MediaBridge;
