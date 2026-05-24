// §S277: Three.js r184 SSAOPass — window.THREE instead of ES import
const {
	AddEquation,
	Color,
	CustomBlending,
	DataTexture,
	DepthTexture,
	DstAlphaFactor,
	DstColorFactor,
	FloatType,
	HalfFloatType,
	MathUtils,
	MeshNormalMaterial,
	NearestFilter,
	NoBlending,
	RedFormat,
	DepthStencilFormat,
	UnsignedInt248Type,
	RepeatWrapping,
	ShaderMaterial,
	UniformsUtils,
	Vector3,
	WebGLRenderTarget,
	ZeroFactor
} = window.THREE;
import { Pass, FullScreenQuad } from './Pass.js';
import { SimplexNoise } from './SimplexNoise.js';
import { SSAOBlurShader, SSAODepthShader, SSAOShader } from './SSAOShader.js';
import { CopyShader } from './CopyShader.js';

class SSAOPass extends Pass {

	constructor( scene, camera, width = 512, height = 512, kernelSize = 32 ) {

		super();

		this.width = width;
		this.height = height;
		this.clear = true;
		this.needsSwap = false;
		this.camera = camera;
		this.scene = scene;

		this.kernelRadius = 8;
		this.kernel = [];
		this.noiseTexture = null;
		this.output = 0;

		this.minDistance = 0.005;
		this.maxDistance = 0.1;

		this._visibilityCache = [];

		//

		this._generateSampleKernel( kernelSize );
		this._generateRandomKernelRotations();

		// depth texture

		const depthTexture = new DepthTexture();
		depthTexture.format = DepthStencilFormat;
		depthTexture.type = UnsignedInt248Type;

		// normal render target with depth buffer

		this.normalRenderTarget = new WebGLRenderTarget( this.width, this.height, {
			minFilter: NearestFilter,
			magFilter: NearestFilter,
			type: HalfFloatType,
			depthTexture: depthTexture
		} );

		// ssao render target

		this.ssaoRenderTarget = new WebGLRenderTarget( this.width, this.height, { type: HalfFloatType } );

		this.blurRenderTarget = this.ssaoRenderTarget.clone();

		// ssao material

		this.ssaoMaterial = new ShaderMaterial( {
			defines: Object.assign( {}, SSAOShader.defines ),
			uniforms: UniformsUtils.clone( SSAOShader.uniforms ),
			vertexShader: SSAOShader.vertexShader,
			fragmentShader: SSAOShader.fragmentShader,
			blending: NoBlending
		} );

		this.ssaoMaterial.defines[ 'KERNEL_SIZE' ] = kernelSize;

		this.ssaoMaterial.uniforms[ 'tNormal' ].value = this.normalRenderTarget.texture;
		this.ssaoMaterial.uniforms[ 'tDepth' ].value = this.normalRenderTarget.depthTexture;
		this.ssaoMaterial.uniforms[ 'tNoise' ].value = this.noiseTexture;
		this.ssaoMaterial.uniforms[ 'kernel' ].value = this.kernel;
		this.ssaoMaterial.uniforms[ 'cameraNear' ].value = this.camera.near;
		this.ssaoMaterial.uniforms[ 'cameraFar' ].value = this.camera.far;
		this.ssaoMaterial.uniforms[ 'resolution' ].value.set( this.width, this.height );
		this.ssaoMaterial.uniforms[ 'cameraProjectionMatrix' ].value.copy( this.camera.projectionMatrix );
		this.ssaoMaterial.uniforms[ 'cameraInverseProjectionMatrix' ].value.copy( this.camera.projectionMatrixInverse );

		// normal material

		this.normalMaterial = new MeshNormalMaterial();
		this.normalMaterial.blending = NoBlending;

		// blur material

		this.blurMaterial = new ShaderMaterial( {
			defines: Object.assign( {}, SSAOBlurShader.defines ),
			uniforms: UniformsUtils.clone( SSAOBlurShader.uniforms ),
			vertexShader: SSAOBlurShader.vertexShader,
			fragmentShader: SSAOBlurShader.fragmentShader
		} );
		this.blurMaterial.uniforms[ 'tDiffuse' ].value = this.ssaoRenderTarget.texture;
		this.blurMaterial.uniforms[ 'resolution' ].value.set( this.width, this.height );

		// material for rendering the depth

		this.depthRenderMaterial = new ShaderMaterial( {
			defines: Object.assign( {}, SSAODepthShader.defines ),
			uniforms: UniformsUtils.clone( SSAODepthShader.uniforms ),
			vertexShader: SSAODepthShader.vertexShader,
			fragmentShader: SSAODepthShader.fragmentShader,
			blending: NoBlending
		} );
		this.depthRenderMaterial.uniforms[ 'tDepth' ].value = this.normalRenderTarget.depthTexture;
		this.depthRenderMaterial.uniforms[ 'cameraNear' ].value = this.camera.near;
		this.depthRenderMaterial.uniforms[ 'cameraFar' ].value = this.camera.far;

		// material for rendering the content of a render target

		this.copyMaterial = new ShaderMaterial( {
			uniforms: UniformsUtils.clone( CopyShader.uniforms ),
			vertexShader: CopyShader.vertexShader,
			fragmentShader: CopyShader.fragmentShader,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			blendSrc: DstColorFactor,
			blendDst: ZeroFactor,
			blendEquation: AddEquation,
			blendSrcAlpha: DstAlphaFactor,
			blendDstAlpha: ZeroFactor,
			blendEquationAlpha: AddEquation
		} );

		// internals

		this._fsQuad = new FullScreenQuad( null );

		this._originalClearColor = new Color();

	}

	dispose() {

		this.normalRenderTarget.dispose();
		this.ssaoRenderTarget.dispose();
		this.blurRenderTarget.dispose();

		this.normalMaterial.dispose();
		this.blurMaterial.dispose();
		this.copyMaterial.dispose();
		this.depthRenderMaterial.dispose();

		this._fsQuad.dispose();

	}

	render( renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */ ) {

		// render normals and depth (honor only meshes, points and lines do not contribute to SSAO)

		this._overrideVisibility();
		this._renderOverride( renderer, this.normalMaterial, this.normalRenderTarget, 0x7777ff, 1.0 );
		this._restoreVisibility();

		// render SSAO

		this.ssaoMaterial.uniforms[ 'kernelRadius' ].value = this.kernelRadius;
		this.ssaoMaterial.uniforms[ 'minDistance' ].value = this.minDistance;
		this.ssaoMaterial.uniforms[ 'maxDistance' ].value = this.maxDistance;
		this._renderPass( renderer, this.ssaoMaterial, this.ssaoRenderTarget );

		// render blur

		this._renderPass( renderer, this.blurMaterial, this.blurRenderTarget );

		// output result to screen

		switch ( this.output ) {

			case SSAOPass.OUTPUT.SSAO:

				this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.ssaoRenderTarget.texture;
				this.copyMaterial.blending = NoBlending;
				this._renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : readBuffer );

				break;

			case SSAOPass.OUTPUT.Blur:

				this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.blurRenderTarget.texture;
				this.copyMaterial.blending = NoBlending;
				this._renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : readBuffer );

				break;

			case SSAOPass.OUTPUT.Depth:

				this._renderPass( renderer, this.depthRenderMaterial, this.renderToScreen ? null : readBuffer );

				break;

			case SSAOPass.OUTPUT.Normal:

				this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.normalRenderTarget.texture;
				this.copyMaterial.blending = NoBlending;
				this._renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : readBuffer );

				break;

			case SSAOPass.OUTPUT.Default:

				this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.blurRenderTarget.texture;
				this.copyMaterial.blending = CustomBlending;
				this._renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : readBuffer );

				break;

			default:
				console.warn( 'THREE.SSAOPass: Unknown output type.' );

		}

	}

	setSize( width, height ) {

		this.width = width;
		this.height = height;

		this.ssaoRenderTarget.setSize( width, height );
		this.normalRenderTarget.setSize( width, height );
		this.blurRenderTarget.setSize( width, height );

		this.ssaoMaterial.uniforms[ 'resolution' ].value.set( width, height );
		this.ssaoMaterial.uniforms[ 'cameraProjectionMatrix' ].value.copy( this.camera.projectionMatrix );
		this.ssaoMaterial.uniforms[ 'cameraInverseProjectionMatrix' ].value.copy( this.camera.projectionMatrixInverse );

		this.blurMaterial.uniforms[ 'resolution' ].value.set( width, height );

	}

	// internals

	_renderPass( renderer, passMaterial, renderTarget, clearColor, clearAlpha ) {

		renderer.getClearColor( this._originalClearColor );
		const originalClearAlpha = renderer.getClearAlpha();
		const originalAutoClear = renderer.autoClear;

		renderer.setRenderTarget( renderTarget );

		renderer.autoClear = false;
		if ( ( clearColor !== undefined ) && ( clearColor !== null ) ) {

			renderer.setClearColor( clearColor );
			renderer.setClearAlpha( clearAlpha || 0.0 );
			renderer.clear();

		}

		this._fsQuad.material = passMaterial;
		this._fsQuad.render( renderer );

		renderer.autoClear = originalAutoClear;
		renderer.setClearColor( this._originalClearColor );
		renderer.setClearAlpha( originalClearAlpha );

	}

	_renderOverride( renderer, overrideMaterial, renderTarget, clearColor, clearAlpha ) {

		renderer.getClearColor( this._originalClearColor );
		const originalClearAlpha = renderer.getClearAlpha();
		const originalAutoClear = renderer.autoClear;

		renderer.setRenderTarget( renderTarget );
		renderer.autoClear = false;

		clearColor = overrideMaterial.clearColor || clearColor;
		clearAlpha = overrideMaterial.clearAlpha || clearAlpha;

		if ( ( clearColor !== undefined ) && ( clearColor !== null ) ) {

			renderer.setClearColor( clearColor );
			renderer.setClearAlpha( clearAlpha || 0.0 );
			renderer.clear();

		}

		this.scene.overrideMaterial = overrideMaterial;
		renderer.render( this.scene, this.camera );
		this.scene.overrideMaterial = null;

		renderer.autoClear = originalAutoClear;
		renderer.setClearColor( this._originalClearColor );
		renderer.setClearAlpha( originalClearAlpha );

	}

	_generateSampleKernel( kernelSize ) {

		const kernel = this.kernel;

		for ( let i = 0; i < kernelSize; i ++ ) {

			const sample = new Vector3();
			sample.x = ( Math.random() * 2 ) - 1;
			sample.y = ( Math.random() * 2 ) - 1;
			sample.z = Math.random();

			sample.normalize();

			let scale = i / kernelSize;
			scale = MathUtils.lerp( 0.1, 1, scale * scale );
			sample.multiplyScalar( scale );

			kernel.push( sample );

		}

	}

	_generateRandomKernelRotations() {

		const width = 4, height = 4;

		const simplex = new SimplexNoise();

		const size = width * height;
		const data = new Float32Array( size );

		for ( let i = 0; i < size; i ++ ) {

			const x = ( Math.random() * 2 ) - 1;
			const y = ( Math.random() * 2 ) - 1;
			const z = 0;

			data[ i ] = simplex.noise3d( x, y, z );

		}

		this.noiseTexture = new DataTexture( data, width, height, RedFormat, FloatType );
		this.noiseTexture.wrapS = RepeatWrapping;
		this.noiseTexture.wrapT = RepeatWrapping;
		this.noiseTexture.needsUpdate = true;

	}

	_overrideVisibility() {

		const scene = this.scene;
		const cache = this._visibilityCache;

		scene.traverse( function ( object ) {

			if ( ( object.isPoints || object.isLine || object.isLine2 ) && object.visible ) {

				object.visible = false;
				cache.push( object );

			}

		} );

	}

	_restoreVisibility() {

		const cache = this._visibilityCache;

		for ( let i = 0; i < cache.length; i ++ ) {

			cache[ i ].visible = true;

		}

		cache.length = 0;

	}

}

SSAOPass.OUTPUT = {
	'Default': 0,
	'SSAO': 1,
	'Blur': 2,
	'Depth': 3,
	'Normal': 4
};

export { SSAOPass };
