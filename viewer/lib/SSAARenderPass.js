// §S277: Three.js r185 SSAARenderPass — window.THREE instead of ES import
const { AdditiveBlending, Color, HalfFloatType, ShaderMaterial, UniformsUtils, WebGLRenderTarget } = window.THREE;
import { Pass, FullScreenQuad } from './Pass.js';
import { CopyShader } from './CopyShader.js';

class SSAARenderPass extends Pass {

	constructor( scene, camera, clearColor = 0x000000, clearAlpha = 0 ) {

		super();

		this.scene = scene;
		this.camera = camera;
		this.sampleLevel = 4;
		this.unbiased = true;
		this.stencilBuffer = false;
		this.clearColor = clearColor;
		this.clearAlpha = clearAlpha;

		// internals

		this._sampleRenderTarget = null;

		this._oldClearColor = new Color();

		this._copyUniforms = UniformsUtils.clone( CopyShader.uniforms );

		this._copyMaterial = new ShaderMaterial(	{
			uniforms: this._copyUniforms,
			vertexShader: CopyShader.vertexShader,
			fragmentShader: CopyShader.fragmentShader,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			premultipliedAlpha: true,
			blending: AdditiveBlending
		} );

		this._fsQuad = new FullScreenQuad( this._copyMaterial );

	}

	dispose() {

		if ( this._sampleRenderTarget ) {

			this._sampleRenderTarget.dispose();
			this._sampleRenderTarget = null;

		}

		this._copyMaterial.dispose();

		this._fsQuad.dispose();

	}

	setSize( width, height ) {

		if ( this._sampleRenderTarget )	this._sampleRenderTarget.setSize( width, height );

	}

	render( renderer, writeBuffer, readBuffer/*, deltaTime, maskActive */ ) {

		if ( ! this._sampleRenderTarget ) {

			this._sampleRenderTarget = new WebGLRenderTarget( readBuffer.width, readBuffer.height, { type: HalfFloatType, stencilBuffer: this.stencilBuffer } );
			this._sampleRenderTarget.texture.name = 'SSAARenderPass.sample';

		}

		const jitterOffsets = _JitterVectors[ Math.max( 0, Math.min( this.sampleLevel, 5 ) ) ];

		const autoClear = renderer.autoClear;
		renderer.autoClear = false;

		renderer.getClearColor( this._oldClearColor );
		const oldClearAlpha = renderer.getClearAlpha();

		const baseSampleWeight = 1.0 / jitterOffsets.length;
		const roundingRange = 1 / 32;
		this._copyUniforms[ 'tDiffuse' ].value = this._sampleRenderTarget.texture;

		const viewOffset = {

			fullWidth: readBuffer.width,
			fullHeight: readBuffer.height,
			offsetX: 0,
			offsetY: 0,
			width: readBuffer.width,
			height: readBuffer.height

		};

		const originalViewOffset = Object.assign( {}, this.camera.view );

		if ( originalViewOffset.enabled ) Object.assign( viewOffset, originalViewOffset );

		// render the scene multiple times, each slightly jitter offset from the last and accumulate the results.
		for ( let i = 0; i < jitterOffsets.length; i ++ ) {

			const jitterOffset = jitterOffsets[ i ];

			if ( this.camera.setViewOffset ) {

				this.camera.setViewOffset(

					viewOffset.fullWidth, viewOffset.fullHeight,

					viewOffset.offsetX + jitterOffset[ 0 ] * 0.0625, viewOffset.offsetY + jitterOffset[ 1 ] * 0.0625, // 0.0625 = 1 / 16

					viewOffset.width, viewOffset.height

				);

			}

			let sampleWeight = baseSampleWeight;

			if ( this.unbiased ) {

				const uniformCenteredDistribution = ( - 0.5 + ( i + 0.5 ) / jitterOffsets.length );
				sampleWeight += roundingRange * uniformCenteredDistribution;

			}

			this._copyUniforms[ 'opacity' ].value = sampleWeight;
			renderer.setClearColor( this.clearColor, this.clearAlpha );
			renderer.setRenderTarget( this._sampleRenderTarget );
			renderer.clear();
			renderer.render( this.scene, this.camera );

			renderer.setRenderTarget( this.renderToScreen ? null : writeBuffer );

			if ( i === 0 ) {

				renderer.setClearColor( 0x000000, 0.0 );
				renderer.clear();

			}

			this._fsQuad.render( renderer );

		}

		if ( this.camera.setViewOffset && originalViewOffset.enabled ) {

			this.camera.setViewOffset(

				originalViewOffset.fullWidth, originalViewOffset.fullHeight,

				originalViewOffset.offsetX, originalViewOffset.offsetY,

				originalViewOffset.width, originalViewOffset.height

			);

		} else if ( this.camera.clearViewOffset ) {

			this.camera.clearViewOffset();

		}

		renderer.autoClear = autoClear;
		renderer.setClearColor( this._oldClearColor, oldClearAlpha );

	}

}

// Jitter vectors on a [-8,8) integer grid, mapped to [-0.5,0.5) by scaling 1/16.
const _JitterVectors = [
	[
		[ 0, 0 ]
	],
	[
		[ 4, 4 ], [ - 4, - 4 ]
	],
	[
		[ - 2, - 6 ], [ 6, - 2 ], [ - 6, 2 ], [ 2, 6 ]
	],
	[
		[ 1, - 3 ], [ - 1, 3 ], [ 5, 1 ], [ - 3, - 5 ],
		[ - 5, 5 ], [ - 7, - 1 ], [ 3, 7 ], [ 7, - 7 ]
	],
	[
		[ 1, 1 ], [ - 1, - 3 ], [ - 3, 2 ], [ 4, - 1 ],
		[ - 5, - 2 ], [ 2, 5 ], [ 5, 3 ], [ 3, - 5 ],
		[ - 2, 6 ], [ 0, - 7 ], [ - 4, - 6 ], [ - 6, 4 ],
		[ - 8, 0 ], [ 7, - 4 ], [ 6, 7 ], [ - 7, - 8 ]
	],
	[
		[ - 4, - 7 ], [ - 7, - 5 ], [ - 3, - 5 ], [ - 5, - 4 ],
		[ - 1, - 4 ], [ - 2, - 2 ], [ - 6, - 1 ], [ - 4, 0 ],
		[ - 7, 1 ], [ - 1, 2 ], [ - 6, 3 ], [ - 3, 3 ],
		[ - 7, 6 ], [ - 3, 6 ], [ - 5, 7 ], [ - 1, 7 ],
		[ 5, - 7 ], [ 1, - 6 ], [ 6, - 5 ], [ 4, - 4 ],
		[ 2, - 3 ], [ 7, - 2 ], [ 1, - 1 ], [ 4, - 1 ],
		[ 2, 1 ], [ 6, 2 ], [ 0, 4 ], [ 4, 4 ],
		[ 2, 5 ], [ 7, 5 ], [ 5, 6 ], [ 3, 7 ]
	]
];

export { SSAARenderPass };
