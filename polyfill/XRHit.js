import MatrixMath from './fill/MatrixMath.js'
import Quaternion from './fill/Quaternion.js'

import XRCoordinateSystem from './XRCoordinateSystem.js'
import XRHitAnchor from './XRHitAnchor.js'

/*
XRHit contains the result of a hit test, and is only valid for one frame.

In order to maintain a reference to the point of contact, createAnchor() must be called 
while the hit test is still valid (within the same frame)
*/
export default class XRHit extends XRCoordinateSystem {
	constructor(){
		super()
		this._anchor = null
	}

	/** 
	 * The anchor that was hit, if there is one 
	 */
	get anchor() { return this._anchor }

	/** 
	 * Create an XRHitAnchor attached at the point of contact 
	 */
	createAnchor() {
		if (this._transform === null) 
			throw new Error('createAnchor must be called before the hit test result has expired')
		
		const anchor = new XRHitAnchor(this._transform, this._anchor)
		// notify the Reality to create an anchor from this hit
		this.dispatchEvent(new CustomEvent('_createAnchor', {anchor})) 
		return anchor
	}
}