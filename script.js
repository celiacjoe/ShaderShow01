

'use strict';


const canvas = document.getElementsByTagName('canvas')[0];
resizeCanvas();

let config = {
    DYE_RESOLUTION: 1024,
    PAUSED: false,
    BACK_COLOR: { r: 0, g: 0, b: 0 },
    TRANSPARENT: false,
  //  SUNRAYS: true,
  //  SUNRAYS_RESOLUTION: 1024,
}

function pointerPrototype () {
    this.id = -1;
    this.texcoordX = 0;
    this.texcoordY = 0;
    this.prevTexcoordX = 0;
    this.prevTexcoordY = 0;
    this.deltaX = 0;
    this.deltaY = 0;
    this.down = false;
    this.moved = false;
}

let pointers = [];
let splatStack = [];
pointers.push(new pointerPrototype());

const { gl, ext } = getWebGLContext(canvas);

if (isMobile()) {
    config.DYE_RESOLUTION = 512;
  //  config.SUNRAYS_RESOLUTION = 512;
}
if (!ext.supportLinearFiltering) {
  //  config.DYE_RESOLUTION = 512;
//  config.SUNRAYS_RESOLUTION = 512;

}

function getWebGLContext (canvas) {
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };

    let gl = canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!isWebGL2)
        gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);

    let halfFloat;
    let supportLinearFiltering;
    if (isWebGL2) {
        gl.getExtension('EXT_color_buffer_float');
        supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
        halfFloat = gl.getExtension('OES_texture_half_float');
        supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }

    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;
    let formatRGBA;
    let formatRG;
    let formatR;

    if (isWebGL2)
    {
        formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
    }
    else
    {
        formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    }

    ga('send', 'event', isWebGL2 ? 'webgl2' : 'webgl', formatRGBA == null ? 'not supported' : 'supported');

    return {
        gl,
        ext: {
            formatRGBA,
            formatRG,
            formatR,
            halfFloatTexType,
            supportLinearFiltering
        }
    };
}

function getSupportedFormat (gl, internalFormat, format, type)
{
    if (!supportRenderTextureFormat(gl, internalFormat, format, type))
    {
        switch (internalFormat)
        {
            case gl.R16F:
                return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
            case gl.RG16F:
                return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
            default:
                return null;
        }
    }

    return {
        internalFormat,
        format
    }
}

function supportRenderTextureFormat (gl, internalFormat, format, type) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    return status == gl.FRAMEBUFFER_COMPLETE;
}


function isMobile () {
    return /Mobi|Android/i.test(navigator.userAgent);
}

function framebufferToTexture (target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    let length = target.width * target.height * 4;
    let texture = new Float32Array(length);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.FLOAT, texture);
    return texture;
}

/*function normalizeTexture (texture, width, height) {
    let result = new Uint8Array(texture.length);
    let id = 0;
    for (let i = height - 1; i >= 0; i--) {
        for (let j = 0; j < width; j++) {
            let nid = i * width * 4 + j * 4;
            result[nid + 0] = clamp01(texture[id + 0]) * 255;
            result[nid + 1] = clamp01(texture[id + 1]) * 255;
            result[nid + 2] = clamp01(texture[id + 2]) * 255;
            result[nid + 3] = clamp01(texture[id + 3]) * 255;
            id += 4;
        }
    }
    return result;
}

function clamp01 (input) {
    return Math.min(Math.max(input, 0), 1);
}*/

/*function textureToCanvas (texture, width, height) {
    let captureCanvas = document.createElement('canvas');
    let ctx = captureCanvas.getContext('2d');
    captureCanvas.width = width;
    captureCanvas.height = height;

    let imageData = ctx.createImageData(width, height);
    imageData.data.set(texture);
    ctx.putImageData(imageData, 0, 0);

    return captureCanvas;
}*/

class Material {
    constructor (vertexShader, fragmentShaderSource) {
        this.vertexShader = vertexShader;
        this.fragmentShaderSource = fragmentShaderSource;
        this.programs = [];
        this.activeProgram = null;
        this.uniforms = [];
    }

    setKeywords (keywords) {
        let hash = 0;
        for (let i = 0; i < keywords.length; i++)
            hash += hashCode(keywords[i]);

        let program = this.programs[hash];
        if (program == null)
        {
            let fragmentShader = compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords);
            program = createProgram(this.vertexShader, fragmentShader);
            this.programs[hash] = program;
        }

        if (program == this.activeProgram) return;

        this.uniforms = getUniforms(program);
        this.activeProgram = program;
    }

    bind () {
        gl.useProgram(this.activeProgram);
    }
}

class Program {
    constructor (vertexShader, fragmentShader) {
        this.uniforms = {};
        this.program = createProgram(vertexShader, fragmentShader);
        this.uniforms = getUniforms(this.program);
    }

    bind () {
        gl.useProgram(this.program);
    }
}

function createProgram (vertexShader, fragmentShader) {
    let program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        console.trace(gl.getProgramInfoLog(program));

    return program;
}

function getUniforms (program) {
    let uniforms = [];
    let uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
        let uniformName = gl.getActiveUniform(program, i).name;
        uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
    }
    return uniforms;
}

function compileShader (type, source, keywords) {
    source = addKeywords(source, keywords);

    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        console.trace(gl.getShaderInfoLog(shader));

    return shader;
};

function addKeywords (source, keywords) {
    if (keywords == null) return source;
    let keywordsString = '';
    keywords.forEach(keyword => {
        keywordsString += '#define ' + keyword + '\n';
    });
    return keywordsString + source;
}

const baseVertexShader = compileShader(gl.VERTEX_SHADER, `
    precision highp float;

    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform vec2 texelSize;

    void main () {
        vUv = aPosition * 0.5 + 0.5;
        /*vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);*/
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`);

const displayShaderSource = `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float time;
    void main () {
      vec2 uv = vUv;
        float c = texture2D(uTexture, vUv).r;
        float hs = fract(sin(dot(vUv,vec2(45.451,98.934)))*7845.236+time*5.);
        float v0 = mix(1.-c,c,pow(hs,10.)*mix(0.,0.7,clamp(c,0.,1.)));
        vec3 v1 = mix(vec3(0.,0.05,0.1),vec3(1.),v0);
        gl_FragColor = vec4(v1,1.);
    }
`;

/*const sunraysShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    lowp float RGBToL(lowp vec3 f){lowp float g=min(min(f.r,f.g),f.b),r=max(max(f.r,f.g),f.b);return(r+g)/2.;}lowp vec3 RGBToHSL(lowp vec3 f){lowp vec3 i;lowp float g=min(min(f.r,f.g),f.b),r=max(max(f.r,f.g),f.b),m=r-g;i.b=(r+g)/2.;if(m==0.)i.r=0.,i.g=0.;else{if(i.b<.5)i.g=m/(r+g);else i.g=m/(2.-r-g);lowp float v=((r-f.r)/6.+m/2.)/m,b=((r-f.g)/6.+m/2.)/m,H=((r-f.b)/6.+m/2.)/m;if(f.r==r)i.r=H-b;else if(f.g==r)i.r=1./3.+v-H;else if(f.b==r)i.r=2./3.+b-v;if(i.r<0.)i.r+=1.;else if(i.r>1.)i.r-=1.;}return i;}lowp float HueToRGB(lowp float r,lowp float f,lowp float i){if(i<0.)i+=1.;else if(i>1.)i-=1.;lowp float l;if(6.*i<1.)l=r+(f-r)*6.*i;else if(2.*i<1.)l=f;else if(3.*i<2.)l=r+(f-r)*(2./3.-i)*6.;else l=r;return l;}lowp vec3 HSLToRGB(lowp vec3 f){lowp vec3 i;if(f.g==0.)i=vec3(f.b);else{lowp float l;if(f.b<.5)l=f.b*(1.+f.g);else l=f.b+f.g-f.g*f.b;lowp float r=2.*f.b-l;i.r=HueToRGB(r,l,f.r+1./3.);i.g=HueToRGB(r,l,f.r);i.b=HueToRGB(r,l,f.r-1./3.);}return i;}

    float ov(float base, float blend) {
    return base<0.5?(2.0*base*blend):(1.0-2.0*(1.0-base)*(1.0-blend));}
vec3 ov3(vec3 a, vec3 b){
    return vec3(ov(a.x,b.x),ov(a.y,b.y),ov(a.z,b.z));}

    void main () {
      vec2 uv = vUv;
vec2 p2 =uv;

p2 = 5.*p2;

float k2 = texture2D(uTexture,vUv).z;
  vec4 k3 = k2 +sin(2.*sin(vec4(k2)*10.)+p2.yxyy-p2.yyxy*.5)/12.;
  lowp float lightness = RGBToL(k3.rgb);
  float s1 = 0.144;
  float s2 = -0.312;
  float s3 = -0.144;
  float m1 = 0.232;
  float m2 = -0.192;
  float m3 = 0.128;
  float l1 = -0.136;
  float l2 = 0.096;
  float l3 = 0.136;
  lowp vec3 s = smoothstep(1./1.5,0.,lightness)*(vec3(s1,s2,s3));
  lowp vec3 m = smoothstep(0.,1./3.,lightness)*smoothstep(1.,2./3.,lightness)*(vec3(m1,m2,m3));
  lowp vec3 l = smoothstep(2./3.,1.,lightness)*(vec3(l1,l2,l3));
  lowp vec3 newColor = k3.xyz+s+m+l ;
      newColor = clamp(newColor, 0.0, 1.0);
  lowp vec3 newHSL = clamp(RGBToHSL(newColor),0.,1.);
      lowp float oldLum = RGBToL(k3.xyz);
      k3.xyz = HSLToRGB(vec3(newHSL.x, newHSL.y, oldLum));
  vec3 mask = mix(vec3(0.,0.,0.368),vec3(-3.,0.12,0.12),distance((-1.+2.*uv)*0.464,vec2(0.)));
  vec3 k4 =ov3(clamp(k3.xyz,0.,1.),mask);
        gl_FragColor = vec4(k4,0.);
    }
`);*/

const splatShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform float time;
    uniform sampler2D uTarget;
    uniform vec2 resolution;
    uniform vec2 mouse;

    void main () {
        vec2 uv = -1.+2.*vUv;
        vec2 uc = vUv;
        //uv.x *= resolution.x/resolution.y;
        float fac = resolution.x/resolution.y;
        vec3 b2 = texture2D(uTarget,uc).xyz;
        float res = 512.;
    float an = step(0.5,fract(time));
    vec2 m1 = mouse-vec2(texture2D(uTarget,vec2(0.25,0.2)).a,texture2D(uTarget,vec2(0.75,0.2)).a);
    vec2 v2 =clamp(m1*5.,-0.25,0.25)* mix(vec2(1.,0.),vec2(0.,1.),an)*vec2(-1.,1.);
    vec2 v3 = vec2(texture2D(uTarget,vec2(0.25,0.8)).a,texture2D(uTarget,vec2(0.75,0.8)).a);
   vec2  v4 = clamp(v3+v2,-1.,1.);
    float v5 = mix(mix(mouse.x,mouse.y,step(0.5,uc.x)),mix(v4.x,v4.y,step(0.5,uc.x)),step(0.5,uc.y));
    vec2 p1 = v3;
    float p2 = length(uv+p1);
    float p3 = mix(length(uv.x+p1.x),length(uv.y* resolution.y/resolution.x+p1.y),1.-an);
    float l1 = max(step(0.2, length(uv.x+p1.x)),step(0.2* fac, length(uv.y+p1.y)));
    float l3 = min(l1,b2.z+0.01);
    float l4 = step(0.9,l3);
    float l5 = min(p3,b2.y+0.01);
    vec2 uc2 = uv;
    float u1 = 0.;
    if(b2.z>0.)u1= uv.x;
   else u1 = uv.y;
   float vl =smoothstep(0.05,0., distance(0.5,mix(fract(b2.y*10.),0.,l4)));
   vec2 pos = vUv*res;
   float ang = (texture2D(uTarget,vUv).y-.5)*1.5;
   vec2 v=vec2(0);
    mat2 m = mat2(cos(ang),sin(ang),-sin(ang),cos(ang));
   vec2 b = vec2(cos(ang),sin(ang));
       vec2 p = b;
       p = m*p;
       p *= 1.5;
       pos = pos +p;
       float rot = 0.;
       rot += dot( texture2D(uTarget,fract((pos+p)/res)).xy-0.5,p.yx);
       v+=p.yx*rot/dot(b,b)*( texture2D(uTarget,vUv).x)*5.;
   float t1 =  texture2D(uTarget,fract((pos+v*vec2(-2,2))/res)).x;
   float t2 =t1*0.98+vl;
        gl_FragColor = vec4(t2,l5,l3,v5);
      //gl_FragColor = vec4(vl,l5,l3,v5);
    }
`);

const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    return (target, clear = false) => {
        if (target == null)
        {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        else
        {
            gl.viewport(0, 0, target.width, target.height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        }
        /*if (clear)
        {
            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }*/
        // CHECK_FRAMEBUFFER_STATUS();
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
})();

function CHECK_FRAMEBUFFER_STATUS () {
    let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status != gl.FRAMEBUFFER_COMPLETE)
        console.trace("Framebuffer error: " + status);
}

let dye;
//let sunrays;

//const sunraysProgram         = new Program(baseVertexShader, sunraysShader);
const splatProgram           = new Program(baseVertexShader, splatShader);


const displayMaterial = new Material(baseVertexShader, displayShaderSource);

function initFramebuffers () {

    let dyeRes = getResolution(config.DYE_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const rgba    = ext.formatRGBA;
    const rg      = ext.formatRG;
    const r       = ext.formatR;
    //const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    gl.disable(gl.BLEND);

  //  if (dye == null)
        dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType,  gl.LINEAR);
  //  else
      //  dye = resizeDoubleFBO(dye,canvas.width*0.5, canvas.height*0.5, rgba.internalFormat, rgba.format, texType, filtering);


    //initSunraysFramebuffers();
}

/*function initSunraysFramebuffers () {
    let res = getResolution(config.SUNRAYS_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const rgba    = ext.formatRGBA;
    const rg      = ext.formatRG;
    const r = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    sunrays     = createFBO(res.width, res.height, rgba.internalFormat, rgba.format, texType, filtering);
}*/

function createFBO (w, h, internalFormat, format, type, param) {
    gl.activeTexture(gl.TEXTURE0);
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    let texelSizeX = 1.0 / w;
    let texelSizeY = 1.0 / h;

    return {
        texture,
        fbo,
        width: w,
        height: h,
        texelSizeX,
        texelSizeY,
        attach (id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };
}

function createDoubleFBO (w, h, internalFormat, format, type, param) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = createFBO(w, h, internalFormat, format, type, param);

    return {
        width: w,
        height: h,
        texelSizeX: fbo1.texelSizeX,
        texelSizeY: fbo1.texelSizeY,
        get read () {
            return fbo1;
        },
        set read (value) {
            fbo1 = value;
        },
        get write () {
            return fbo2;
        },
        set write (value) {
            fbo2 = value;
        },
        swap () {
            let temp = fbo1;
            fbo1 = fbo2;
            fbo2 = temp;
        }
    }
}

function updateKeywords () {
    let displayKeywords = [];
  //  if (config.SUNRAYS) displayKeywords.push("SUNRAYS");
    displayMaterial.setKeywords(displayKeywords);
}

updateKeywords();
initFramebuffers();

let lastUpdateTime = Date.now();
update();

function update () {
    const dt = calcDeltaTime();
    if (resizeCanvas())
        initFramebuffers();
//    updateColors(dt);
    applyInputs();
  /*  if (!config.PAUSED)
        step(dt);*/
    render(null);
    requestAnimationFrame(update);
}

function calcDeltaTime () {
    let now = Date.now();
    let dt = (now - lastUpdateTime) / 1000;
    dt = Math.min(dt, 0.016666);
    lastUpdateTime = now;
    return dt;
}

function resizeCanvas () {
    let width = scaleByPixelRatio(canvas.clientWidth);
    let height = scaleByPixelRatio(canvas.clientHeight);
    if (canvas.width != width || canvas.height != height) {
        canvas.width = width;
        canvas.height = height;
        return true;
    }
    return false;
}

function applyInputs () {

  //  pointers.forEach(p => {splatPointer();});
  splatPointer( pointers[0]);
}

function render (target) {

      //  applySunrays(dye.read, dye.write, sunrays);
    drawDisplay(target);
}

function drawDisplay (target) {
    let width = target == null ? gl.drawingBufferWidth : target.width;
    let height = target == null ? gl.drawingBufferHeight : target.height;

    displayMaterial.bind();
    gl.uniform1f(displayMaterial.uniforms.time, performance.now() / 1000);
  //      gl.uniform1i(displayMaterial.uniforms.uSunrays, sunrays.attach(3));
    blit(target);
}

/*function applySunrays (source, mask, destination) {
    gl.disable(gl.BLEND);
    sunraysProgram.bind();
    gl.uniform1f(sunraysProgram.uniforms.weight, config.SUNRAYS_WEIGHT);
    blit(destination);
}*/

function splatPointer (pointer) {

    splat(pointer.texcoordX, pointer.texcoordY);
}

function splat (x, y) {
    splatProgram.bind();
    gl.uniform1f(splatProgram.uniforms.time, performance.now() / 1000);
    gl.uniform2f(splatProgram.uniforms.resolution, canvas.width , canvas.height);
    gl.uniform2f(splatProgram.uniforms.mouse, x, 1.-y);
    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
    blit(dye.write);
    dye.swap();
}

canvas.addEventListener('mousedown', e => {
    let posX = scaleByPixelRatio(e.offsetX);
    let posY = scaleByPixelRatio(e.offsetY);
    //let pointer = pointers.find(p => p.id == -1);
    let pointer = pointers[0];
    if (pointer == null)
        pointer = new pointerPrototype();
    updatePointerDownData(pointer, -1, posX, posY);
});

canvas.addEventListener('mousemove', e => {
    let pointer = pointers[0];
    if (!pointer.down) return;
    let posX = scaleByPixelRatio(e.offsetX);
    let posY = scaleByPixelRatio(e.offsetY);
    updatePointerMoveData(pointer, posX, posY);
});

window.addEventListener('mouseup', () => {
    updatePointerUpData(pointers[0]);
});

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    while (touches.length >= pointers.length)
        pointers.push(new pointerPrototype());
    for (let i = 0; i < touches.length; i++) {
        let posX = scaleByPixelRatio(touches[i].pageX);
        let posY = scaleByPixelRatio(touches[i].pageY);
        //updatePointerDownData(pointers[i + 1], touches[i].identifier, posX, posY);
        updatePointerDownData(pointers[0], touches[i].identifier, posX, posY);
    }
});

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
        //let pointer = pointers[i + 1];
        let pointer = pointers[0];
        if (!pointer.down) continue;
        let posX = scaleByPixelRatio(touches[i].pageX);
        let posY = scaleByPixelRatio(touches[i].pageY);
        updatePointerMoveData(pointer, posX, posY);
    }
}, false);

window.addEventListener('touchend', e => {
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++)
    {
        let pointer = pointers.find(p => p.id == touches[i].identifier);
        if (pointer == null) continue;
        updatePointerUpData(pointer);
    }
});


function updatePointerDownData (pointer, id, posX, posY) {
    pointer.id = id;
    pointer.down = true;
    pointer.moved = false;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.deltaX = 0;
    pointer.deltaY = 0;
}

function updatePointerMoveData (pointer, posX, posY) {
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
    pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
}

function updatePointerUpData (pointer) {
    pointer.down = false;
}

function correctDeltaX (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio < 1) delta *= aspectRatio;
    return delta;
}

function correctDeltaY (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) delta /= aspectRatio;
    return delta;
}

/*function wrap (value, min, max) {
    let range = max - min;
    if (range == 0) return min;
    return (value - min) % range + min;
}*/

function getResolution (resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1)
        aspectRatio = 1.0 / aspectRatio;

    let min = Math.round(resolution);
    let max = Math.round(resolution * aspectRatio);

    if (gl.drawingBufferWidth > gl.drawingBufferHeight)
        return { width: max, height: min };
    else
        return { width: min, height: max };
}

function getTextureScale (texture, width, height) {
    return {
        x: width / texture.width,
        y: height / texture.height
    };
}

function scaleByPixelRatio (input) {
    let pixelRatio = window.devicePixelRatio || 1;
    return Math.floor(input * pixelRatio);
}

function hashCode (s) {
    if (s.length == 0) return 0;
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = (hash << 5) - hash + s.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
};
