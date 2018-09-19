import XRCoordinateSystem from './XRCoordinateSystem.js'
import XRAnchor from './XRAnchor.js'

/*
XRHit contains the result of a hit test.

In order to retain the point of contact beyond a single frame, 
XRFrame.createAnchorFromHit() must be used.
*/
export default class XRHit extends XRCoordinateSystem {
	constructor(uid){
		super()
		this._uid = uid || XRAnchor._generateUID()
		this._targetAnchor = null
		this._type = 'unknown'
	}

	get uid(){ return this._uid }

	/**
	 * The type of object that was hit
	 */
	get type() { return this._type }

	/** 
	 * The object that was hit, if known
	 */
	get target() { return this._target }
}

XRHit.UNKNOWN = "unknown"
XRHit.FLOOR = "floor"
XRHit.PLATFORM = "platform"
XRHit.CEILING = "ceiling"
XRHit.WALL = "wall"