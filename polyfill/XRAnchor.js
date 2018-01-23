import XRCoordinateSystem from './XRCoordinateSystem.js'
import MatrixMath from './fill/MatrixMath';

/*
XRAnchors provide per-frame coordinates which the Reality attempts to pin "in place".
In a Virtual Reality these coordinates do not change. 
In a Reality based on environment mapping sensors, the anchors may change pose on a per-frame bases as the system refines its map.
*/
export default class XRAnchor extends XRCoordinateSystem {
	constructor(uid){
		super()
		this._uid = uid || XRAnchor._generateUID()
		this._isTrackable = false
		this.__isTracking = false
	}

	get uid(){ return this._uid }

	/**
	 * If true, this anchor corresponds to a movable object that can be tracked.
	 * This property value does not change for the lifetime of an XRAnchor instance.
	 */
	get isTrackable() { return this._isTrackable }

	/**
	 * If true, then this anchor is actively being tracked.
	 * 
	 * If this anchor is not trackable, then `isTracking` always false. 
	 * If this anchor is trackable, `isTracking` can change at any time. 
	 * 
	 * Changes to tracking state correspond to 'found' and 'lost' events:
	 *  - "found" : anchor is now being tracked (isTracking is true)
	 *  - "lost"  : anchor is no longer being tracked (isTracking is false)
	 * 
	 * When tracking is lost, getTransformTo() reports as if the anchor is stationary
	 */
	get isTracking() { return this.__isTracking }

	set _isTracking(value) {
		const isTracking = this.__isTracking
		this.__isTracking = value
		if (isTracking === false && value === true) {
			this.dispatchEvent(new CustomEvent('found'))
		} else if (isTracking === true && value === false) {
			this.dispatchEvent(new CustomEvent('lost'))
		}
	}
	
	static _generateUID(){
		return 'anchor-' + new Date().getTime() + '-' + Math.floor((Math.random() * Number.MAX_SAFE_INTEGER))
	}

}