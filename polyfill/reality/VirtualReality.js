import Reality from '../Reality.js'

/*
VirtualReality is a Reality that is empty and waiting for fanstastic CG scenes.
*/
export default class VirtualReality extends Reality {
	constructor(device){
		super(device, 'Virtual', false, false)
	}

	/*
	Called when at least one active XRSession is using this Reality
	*/
	_start(){
	}

	/*
	Called when no more active XRSessions are using this Reality
	*/
	_stop(){
	}

	/*
	Called by a session before it hands a new XRFrame to the app
	*/
	_beforeAnimationFrame(){}

	/*
	Create an anchor hung in space
	*/
	_addAnchor(anchor){
		this._anchors.set(anchor.uid, anchor)
		return anchor.uid
	}

	_removeAnchor(uid){
		this._anchors.delete(uid)
	}

	_requestHitTest(normalizedScreenX, normalizedScreenY){
		return Promise.resolve(null)
	}

	_hitTest(normalizedScreenX, normalizedScreenY){
		return null
	}

	_getHasLightEstimate(){
		return false;
	}
}