import XRTracker from '../XRTracker.js'

const LICENSE_KEY_MISSING_ERROR = 
`An encrypted license key is required in order to use the Vuforia extension. 
You can get a Vuforia license key from https://developer.vuforia.com/
Then, encrypt your key with the tool at http://docs.argonjs.io/start/vuforia-pgp-encryptor, 
and provide the encrypted license key to the init() method`;

export default class ArgonVuforiaTracker extends XRTracker {

    static _requestTracker(session, options) {
		const encryptedLicenseData = options.encryptedLicenseData
        if (!encryptedLicenseData || typeof encryptedLicenseData !== 'string') 
			throw new Error(LICENSE_KEY_MISSING_ERROR)
        return this._argonWrapper._request('ar.vuforia.init', {encryptedLicenseData}).then(() => {
			return new ArgonVuforiaTracker(session)
		});
	}

	constructor(reality) {
        this._reality = reality
		this._argonWrapper = reality._argonWrapper
		this._objectTracker = new VuforiaObjectTracker(this);
	}

	/**
	 * @param {number} value 
	 * @returns {Promise<boolean>}
	 */
    setMaxSimultaneousImageTargetsHint(value) {
        let options = {hint:VuforiaHintMaxSimultaneousImageTargets, value};
        return this._argonWrapper._request('ar.vuforia.setHint', options).then((message) => {
            return message.result;
        })
    }

	/**
	 * @param {number} value 
	 * @returns {Promise<boolean>}
	 */
    setMaxSimultaneousObjectTargetsHint(value) {
        let options = {hint:VuforiaHintMaxSimultaneousObjectTargets, value};
        return this._argonWrapper._request('ar.vuforia.setHint', options).then((message) => {
            return message.result;
        })
	}
	
	/**
	 * Fetch a dataset from the provided url. 
	 * If successfull, resolves to an id which represents the dataset. 
	 */
	fetchDataSetFromURL(url) {
		url = resolveURL(url)
		return this._argonWrapper._request('ar.vuforia.objectTrackerCreateDataSet', { url })
			.then((message) => {
				return message.id;
			});
	}

	/**
	 * Load the dataset into memory, and return a promise which
	 * resolves to an array of the contained trackables
	 */
	loadDataSet(id) {
		return this._argonWrapper._request('ar.vuforia.objectTrackerLoadDataSet', { id }).then((trackables)=>{
            const trackablesMap = new Map
            for (const name in trackables) {
                const trackable = trackables[name]
                trackablesMap.set(name, {
                    name,
                    createAnchor() {
						const anchor = new XRAnchor(trackable.id)
						anchor._isTrackable = true
                        this.reality._anchors.set(anchor.uid, anchor)
                        return anchor
                    }
                })
            }
        });
	}

	/**
	 * Unload a dataset from memory (deactivating it if necessary)
	 */
	unloadDataSet(id) {
		this._argonWrapper._request('ar.vuforia.objectTrackerUnloadDataSet', { id });
	}

	/**
	 * Load (if necessary) and activate a dataset to enable tracking of the contained trackables
	 */
	activateDataSet(id) {
		return this._argonWrapper._request('ar.vuforia.objectTrackerActivateDataSet', { id });
	}

	/**
	 * Deactivate a loaded dataset to disable tracking of the contained trackables
	 */
	deactivateDataSet(id) {
		return this._argonWrapper._request('ar.vuforia.objectTrackerDeactivateDataSet', { id });
	}

}

const VuforiaHintMaxSimultaneousImageTargets = 0
const VuforiaHintMaxSimultaneousObjectTargets = 1
const VuforiaHintDelayedLoadingObjectDatasets = 2


// class VuforiaObjectTracker extends EventHandlerBase {

// 	constructor(ext) {
//         super()
// 		this._argonWrapper = ext._argonWrapper

// 		// this._argonWrapper._messageHandlers.on['ar.vuforia.objectTrackerLoadDataSetEvent'] = (message) => {
// 		// 	this.dispatchEvent(new CustomEvent('datasetloaded', {detail:message}))
//         // }

//         // this._argonWrapper._messageHandlers.on['ar.vuforia.objectTrackerUnloadDataSetEvent'] = (message) => {
// 		// 	this.dispatchEvent(new CustomEvent('datasetunloaded', {detail:message}))
//         // }

//         // this._argonWrapper._messageHandlers.on['ar.vuforia.objectTrackerActivateDataSetEvent'] = (message) => {
// 		// 	this.dispatchEvent(new CustomEvent('datasetactivated', {detail:message}))
//         // }

//         // this._argonWrapper._messageHandlers.on['ar.vuforia.objectTrackerDeactivateDataSetEvent'] = (message) => {
// 		// 	this.dispatchEvent(new CustomEvent('datasetdeactivated', {detail:message}))
// 		// }
// 	}

// }


function resolveURL(inURL) {
    if (!urlParser) throw new Error("resolveURL requires DOM api");
    if (inURL === undefined) throw new Error('Expected inURL')
    urlParser.href = '';
    urlParser.href = inURL
    return urlParser.href
}