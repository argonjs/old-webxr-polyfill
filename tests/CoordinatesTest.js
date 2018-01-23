import Test from './Test.js'

import MatrixMath from '../polyfill/fill/MatrixMath.js'
import XRDisplay from '../polyfill/XRDisplay.js'
import XRCoordinateSystem from '../polyfill/XRCoordinateSystem.js'

import Quaternion from '../polyfill/fill/Quaternion.js'

export default class CoordinatesTest extends Test {
	testTransform(){
		let display1 = new MockXRDisplay()
		let trackerCoordinateSystem = new XRCoordinateSystem()

		// Test that getTransformTo returns null when transform is null
		this.assertEqual(
			display1._pose.getTransformTo(trackerCoordinateSystem),
			null
		)

		// Test the transform is where we expect it
		trackerCoordinateSystem._transform = MatrixMath.mat4_generateIdentity()
		let h2tTransform = display1._pose.getTransformTo(trackerCoordinateSystem)
		this.assertFloatArraysEqual(
			[0, 0, 0],
			[h2tTransform[12], h2tTransform[13], h2tTransform[14]]
		)

		// Offset the device pose and test the transform
		pose = MatrixMath.mat4_generateIdentity()
		pose[12] = 0
		pose[13] = XRDevicePose.SITTING_EYE_HEIGHT
		pose[14] = 0.5
		display1._pose._transform = pose
		h2tTransform = display1._pose.getTransformTo(trackerCoordinateSystem)
		this.assertFloatArraysEqual(
			[0, XRDevicePose.SITTING_EYE_HEIGHT, 0.5],
			[h2tTransform[12], h2tTransform[13], h2tTransform[14]]
		)
		this.assertFloatArraysEqual(
			[0, XRDevicePose.SITTING_EYE_HEIGHT, 0.5],
			display1._pose._position[2]
		)

		// Test that relative coordinate systems correctly provide transforms
		let relativeCoordinateSystem = new XRCoordinateSystem()
		let pose = MatrixMath.mat4_generateIdentity()
		pose[12] = 1
		pose[13] = 2
		pose[14] = 3
		relativeCoordinateSystem._transform = pose
		let r2hTransform = relativeCoordinateSystem.getTransformTo(display1._pose)
		this.assertFloatArraysEqual(
			[1, 2 + XRDevicePose.SITTING_EYE_HEIGHT, 3],
			[r2hTransform[12], r2hTransform[13], r2hTransform[14]]
		)

		// Rotate the head and test the transform
		let quat1 = new Quaternion()
		quat1.setFromEuler(0, -Math.PI, 0)
		display1._pose._transform = MatrixMath.mat4_fromRotationTranslation(new Float32Array(16), quat1.toArray())
		h2tTransform = display1._pose.getTransformTo(trackerCoordinateSystem)
		let trackerPosition = MatrixMath.mat4_get_position(new Float32Array(3), h2tTransform)
		this.assertEqual(trackerPosition[2], display1._pose._position[2])
		quat1.inverse()
		let trackerOrientation = MatrixMath.mat4_get_rotation(new Float32Array(4), h2tTransform)
		this.assertFloatArraysEqual(quat1.toArray(), trackerOrientation)
	}
}

class MockXR {

}

class MockReality {

}

class MockXRDisplay extends XRDisplay {
	constructor(xr=null, displayName='Mock', isExternal=false, reality=null){
		super(xr ? xr : new MockXR(), displayName, isExternal, reality ? reality : new MockReality())
	}
}