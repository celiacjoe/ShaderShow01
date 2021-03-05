const container = document.body;
const FOV = 45;
const NEAR = 0.1;
const FAR = 1000;
let height = container.clientHeight;
let width = container.clientWidth;
let mousex = container.clientX;
const ASPECT = width / height;
var uniforms;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setClearColor(0x000000);
const canvas = renderer.domElement;
const scene = new THREE.Scene();
const clock = new THREE.Clock();
const resolution = new THREE.Vector2(width, height);

uniforms = {mouse: {type: "v2",value: new THREE.Vector2()}};

document.onmousemove = function(e) {
  uniforms.mouse.value.x = e.pageX ;
  uniforms.mouse.value.y = e.pageY ;
}

const VERTEX = `
    varying vec2 vUv;
    void main() {
      //  vec4 mvPosition = modelViewMatrix * vec4(position, 1.);
        gl_Position = vec4(position, 1.);
        vUv = uv;
    }
`;
const FRAGMENT = `
    uniform vec2 iResolution;
    uniform vec2 mouse;
    varying vec2 vUv;
    uniform float iTime;
    void main( )
    {
      vec2 uv =  vUv;
      vec2 fac = vec2(iResolution.x/iResolution.y,1.);
      uv *= fac;
      float a = iTime ;
      float d, e, f, g = 1.0 / 40.0 ,h ,i ,r ,q;
      float d1 = smoothstep(0.05+a*0.1,0.04,distance(mouse*fac+fract(a),uv));
      gl_FragColor = vec4( d1 );
    }
`;

const drawShader = {
    uniforms: {
        tDiffuse: { type: 't', value: null },
        tShadow: { type: 't', value: null },
        iResolution: { type: 'v2', value: resolution },
        iTime: { type: 'f', value: 0.0}
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
};

   const composer = new THREE.EffectComposer(renderer);
   const pass = new THREE.ShaderPass(drawShader);
    composer.addPass(pass);

 const FRAGMENT_FINAL = `
uniform sampler2D tDiffuse;
uniform sampler2D tNoise;
uniform float iTime;

varying vec2 vUv;

#define EdgeColor vec4(0.2, 0.2, 0.15, 1.0)
#define BackgroundColor vec4(1,0.95,0.85,1)
#define NoiseAmount 0.01
#define ErrorPeriod 30.0
#define ErrorRange 0.003

float triangle(float x)
{
    return abs(1.0 - mod(abs(x), 2.0)) * 2.0 - 1.0;
}

float rand(float x)
{
    return fract(sin(x) * 43758.5453);
}

void main()
{
    float time = floor(iTime * 16.0) / 16.0;
    vec2 uv = vUv;
    uv += vec2(triangle(uv.y * rand(time) * 1.0) * rand(time * 1.9) * 0.005,
            triangle(uv.x * rand(time * 3.4) * 1.0) * rand(time * 2.1) * 0.005);

    float noise = (texture2D(tNoise, uv * 0.5).r - 0.5) * NoiseAmount;
    vec2 uvs[3];
    uvs[0] = uv + vec2(ErrorRange * sin(ErrorPeriod * uv.y + 0.0) + noise, ErrorRange * sin(ErrorPeriod * uv.x + 0.0) + noise);
    uvs[1] = uv + vec2(ErrorRange * sin(ErrorPeriod * uv.y + 1.047) + noise, ErrorRange * sin(ErrorPeriod * uv.x + 3.142) + noise);
    uvs[2] = uv + vec2(ErrorRange * sin(ErrorPeriod * uv.y + 2.094) + noise, ErrorRange * sin(ErrorPeriod * uv.x + 1.571) + noise);

    float edge = texture2D(tDiffuse, uvs[0]).r * texture2D(tDiffuse, uvs[1]).r * texture2D(tDiffuse, uvs[2]).r;
    float diffuse = texture2D(tDiffuse, uv).g;

    float w = fwidth(diffuse) * 2.0;
    vec4 mCol = mix(BackgroundColor * 0.5, BackgroundColor, mix(0.0, 1.0, smoothstep(-w, w, diffuse - 0.3)));
    gl_FragColor = mix(EdgeColor, mCol, edge);
}
`;


const finalShader = {
    uniforms: {
        tDiffuse: { type: 't', value: null},
        iTime: { type: 'f', value: 0.0},
        //tNoise: { type: 't', value: new THREE.TextureLoader().load('noise.png')}
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT_FINAL
};

const passFinal = new THREE.ShaderPass(finalShader);
passFinal.renderToScreen = true;
passFinal.material.extensions.derivatives = true;
composer.addPass(passFinal);


const resize = (width, height) => {

    composer.setSize(width, height);

    pass.uniforms.iResolution.value.set(width, height);

    renderer.setSize(width, height);
};


const render = () => {
    const tmpHeight = container.clientHeight;
    const tmpWidth = container.clientWidth;
    if (tmpHeight !== height || tmpWidth !== width) {
        height = tmpHeight;
        width = tmpWidth;
        resize(width, height);
    }

    const ellapsed = clock.getElapsedTime();
    passFinal.uniforms.iTime.value = ellapsed;

    composer.render();

    requestAnimationFrame(render);
};



container.appendChild(canvas);
resize(width, height);
render();
