import XRViewport from './XRViewport.js'
import MatrixMath from './fill/MatrixMath.js'

/*
An XRView describes a single view into an XR scene.
It provides several values directly, and acts as a key to query view-specific values from other interfaces.
*/
export default class XRView {
	constructor(projectionMatrix, 
		eyeDisplacementMatrix = MatrixMath.mat4_generateIdentity(), 
		normalizedViewport = new XRViewport(0, 0, 1, 1), 
		eye = XRView.LEFT){
		this._projectionMatrix = projectionMatrix
		this._eyeDisplacementMatrix = eyeDisplacementMatrix
		this._normalizedViewport = normalizedViewport
		this._eye = eye

		this._didPrintViewMatrixWarning = false
	}

	get eye(){ return this._eye }

	get projectionMatrix(){ return this._projectionMatrix }

	setProjectionMatrix(array16){
		for(let i=0; i < 16; i++){
			this._projectionMatrix[i] = array16[i]
		}
	}

	get viewMatrix(){ 
		if (!this._didPrintViewMatrixWarning) {
			this._didPrintViewMatrixWarning = true
			console.warn('XRView.viewMatrix is deprecated. Use XRDevicePose.getViewMatrix(), which is inverted from this value')
		}
		return this._viewMatrix 
	}

	getViewport(layer){
		return {
			x: Math.round(this._normalizedViewport.x * layer.framebufferWidth),
			y: Math.round(this._normalizedViewport.y * layer.framebufferHeight),
			width: Math.round(this._normalizedViewport.width * layer.framebufferWidth),
			height: Math.round(this._normalizedViewport.height * layer.framebufferHeight)
		}
	}
}

XRView.LEFT = 'left'
XRView.RIGHT = 'right'
XRView.EYES = [XRView.LEFT, XRView.RIGHT]