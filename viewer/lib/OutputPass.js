// §S277: Three.js r184 OutputPass — window.THREE instead of ES import
const {
	ColorManagement,
	RawShaderMaterial,
	UniformsUtils,
	LinearToneMapping,
	ReinhardToneMapping,
	CineonToneMapping,
	AgXToneMapping,
	ACESFilmicToneMapping,
	NeutralToneMapping,
	CustomToneMapping,
	SRGBTransfer
} = window.THREE;
import { Pass, FullScreenQuad } from './Pass.js';
import { OutputShader } from './OutputShader.js';

class OutputPass extends Pass {

	constructor() {

		super();

		this.isOutputPass = true;

		this.uniforms = UniformsUtils.clone( OutputShader.uniforms );

		this.material = new RawShaderMaterial( {
			name: OutputShader.name,
			uniforms: this.uniforms,
			vertexShader: OutputShader.vertexShader,
			fragmentShader: OutputShader.fragmentShader
		} );

		this._fsQuad = new FullScreenQuad( this.material );

		this._outputColorSpace = null;
		this._toneMapping = null;

	}

	render( renderer, writeBuffer, readBuffer/*, deltaTime, maskActive */ ) {

		this.uniforms[ 'tDiffuse' ].value = readBuffer.texture;
		this.uniforms[ 'toneMappingExposure' ].value = renderer.toneMappingExposure;

		if ( this._outputColorSpace !== renderer.outputColorSpace || this._toneMapping !== renderer.toneMapping ) {

			this._outputColorSpace = renderer.outputColorSpace;
			this._toneMapping = renderer.toneMapping;

			this.material.defines = {};

			if ( ColorManagement.getTransfer( this._outputColorSpace ) === SRGBTransfer ) this.material.defines.SRGB_TRANSFER = '';

			if ( this._toneMapping === LinearToneMapping ) this.material.defines.LINEAR_TONE_MAPPING = '';
			else if ( this._toneMapping === ReinhardToneMapping ) this.material.defines.REINHARD_TONE_MAPPING = '';
			else if ( this._toneMapping === CineonToneMapping ) this.material.defines.CINEON_TONE_MAPPING = '';
			else if ( this._toneMapping === ACESFilmicToneMapping ) this.material.defines.ACES_FILMIC_TONE_MAPPING = '';
			else if ( this._toneMapping === AgXToneMapping ) this.material.defines.AGX_TONE_MAPPING = '';
			else if ( this._toneMapping === NeutralToneMapping ) this.material.defines.NEUTRAL_TONE_MAPPING = '';
			else if ( this._toneMapping === CustomToneMapping ) this.material.defines.CUSTOM_TONE_MAPPING = '';

			this.material.needsUpdate = true;

		}

		if ( this.renderToScreen === true ) {

			renderer.setRenderTarget( null );
			this._fsQuad.render( renderer );

		} else {

			renderer.setRenderTarget( writeBuffer );
			if ( this.clear ) renderer.clear( renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil );
			this._fsQuad.render( renderer );

		}

	}

	dispose() {

		this.material.dispose();
		this._fsQuad.dispose();

	}

}

export { OutputPass };
