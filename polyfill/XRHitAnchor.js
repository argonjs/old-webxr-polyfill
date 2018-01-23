import XRAnchor from './XRAnchor.js'

class XRHitAnchor extends XRAnchor {

    constructor(transform, parentAnchor) {
        super()
        this._transform = transform
        this._parentAnchor = parentAnchor || null

        this._localTransform = null
        if (this._parentAnchor && this._parentAnchor.isTrackable) {
            this._localTransform = this.getTransformTo(this._parentAnchor)
        }
    }

	get _transform() {
		if (this._parentAnchor && this._localTransform) {
			this.__transform = MatrixMath.mat4_multiply(
				this.__transform || new Float32Array(16), 
                this._parentAnchor._transform,
                this._localTransform
			)
		}
		return this.__transform
    }

    set _transform() {
        this._localTransform = null // setting a global transform removes the local transform
		if (this._checkValueNull(value)) return
		this.__transform.set(value)
    }

}