import * as THREE from 'three';
import {GLTFLoader} from 'GLTFLoader';
import {OrbitControls} from 'OrbitControls';
import {VOXLoader} from 'VOXLoader';
import {world} from './world.js';
import {parseQuery, addDefaultLights} from './util.js';
import {storageHost} from './constants.js';
import Avatar from './avatars/avatars.js';
import extractPeaks from './webaudio-peaks.js';

import App from '/app.js';

const _loadVrm = async src => {
  let o;
  try {
    o = await new Promise((accept, reject) => {
      new GLTFLoader().load(src, accept, function onprogress() {}, reject);
    });
  } catch(err) {
    console.warn(err);
  } /* finally {
    URL.revokeObjectURL(u);
  } */
  console.log('loaded VRM', o);
  
  const rig = new Avatar(o, {
    fingers: true,
    hair: true,
    visemes: true,
    debug: false //!o,
  });
  rig.model.isVrm = true;
  /* rig.aux = oldRig.aux;
  rig.aux.rig = rig; */
  
  o = o.scene;
  o.rig = rig;
  
  return o;
};
const _loadGltf = async src => {
  let o;
  try {
    o = await new Promise((accept, reject) => {
      new GLTFLoader().load(src, accept, function onprogress() {}, reject);
    });
  } catch(err) {
    console.warn(err);
  } /* finally {
    URL.revokeObjectURL(u);
  } */
  console.log('loaded GLTF', o);
  o = o.scene;
  return o;
};
const _loadVox = async src => {
  let o;
  try {
    o = await new Promise((accept, reject) => {
      new VOXLoader({
        scale: 0.01,
      }).load(src, accept, function onprogress() {}, reject);
    });
  } catch(err) {
    console.warn(err);
  }
  return o;
};

window.onload = async () => {
  const container = document.getElementById('container');

  const _tokenIdToHash = async tokenId => {  
    const res = await fetch(`https://tokens.webaverse.com/${tokenId}`);
    const token = await res.json();
    const {hash} = token;
    return hash;
  };
  const _hashToSrc = hash => `${storageHost}/ipfs/${hash}`;
  const _setContainerContent = el => {
    container.innerHTML = '';
    if (el) {
      container.appendChild(el);
    }
  };
  const metaversefileHandler = async ({
    src,
  }) => {
    console.log('load metaversefile');

    const container = document.getElementById('container2');
    container2.classList.remove('hidden');

    const app = new App();
    // app.bootstrapFromUrl(location);
    app.bindLogin();
    app.bindInput();
    app.bindInterface();
    const canvas = document.getElementById('canvas');
    app.bindCanvas(canvas);
    
    await app.waitForLoad();    
    app.contentLoaded = true;
    app.startLoop();
    
    const u = `${storageHost}/ipfs/${hash}/.metaversefile`;
    const position = new THREE.Vector3();
    const quaternion  = new THREE.Quaternion();
    const loadedObject = await world.addObject(u, null, position, quaternion, {
      // physics,
      // physics_url,
      // autoScale,
    });

    /* let loadedObject = null;
    const loadHash = async hash => {
      if (loadedObject) {
        await world.removeObject(loadedObject.instanceId);
        loadedObject = null;
      }

      const u = `${storageHost}/ipfs/${hash}/.metaversefile`;
      const position = new THREE.Vector3();
      const quaternion  = new THREE.Quaternion();
      loadedObject = await world.addObject(u, null, position, quaternion, {
        // physics,
        // physics_url,
        // autoScale,
      });
    }; */
  };
  const imageHandler = async ({
    src,
  }) => {
    const img = new Image();
    img.classList.add('content');
    img.classList.add('img');
    _setContainerContent(img);

    await new Promise((accept, reject) => {
      img.onload = () => {
        accept();
      };
      img.onerror = reject;
      img.src = src;
    });
  };
  const handlers = {
    'metaversefile': metaversefileHandler,
    'png': imageHandler,
    'jpg': imageHandler,
    'gif': imageHandler,
    'mp4': async ({
      src,
    }) => {
      const video = document.createElement('video');
      video.classList.add('content');
      video.classList.add('video');
      video.setAttribute('controls', true);
      video.setAttribute('autoplay', true);
      video.setAttribute('muted', true);
      // window.video = video;
      _setContainerContent(video);

      await new Promise((accept, reject) => {
        video.oncanplaythrough = () => {
          accept();
        };
        video.onerror = reject;
        video.src = src;
      });
    },
    'mp3': async ({
      src,
    }) => {
      _setContainerContent(null);
      
      const [
        audioData,
        audio,
      ] = await Promise.all([
        (async () => {
          const res = await fetch(src);
          return await res.arrayBuffer();
        })(),
        (async () => {
          const audio = new Audio();
          audio.classList.add('content');
          audio.classList.add('audio');
          audio.setAttribute('controls', true);
          await new Promise((accept, reject) => {
            audio.oncanplaythrough = () => {
              accept();
            };
            audio.onerror = reject;
            audio.src = src;
          });
          return audio;
        })(),
      ]);
      
      const canvas = document.createElement('canvas');
      const width = window.innerWidth;
      const height = window.innerHeight / 2;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      canvas.style.cssText = `width: ${width}px; height: ${height}px;`;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#333';
      _setContainerContent(null);
      
      const blocker = document.createElement('div');
      blocker.classList.add('blocker');
      blocker.style.cssText = `position: absolute; left: 0; width: ${window.innerWidth}px; height: ${height}px; transform-origin: 0 50%;`;
      container.appendChild(blocker);
      container.appendChild(canvas);
      container.appendChild(audio);
      
      const _setX = x => {
        blocker.style.transform = `translateX(${x * window.innerWidth}px)`;
      };
      
      canvas.addEventListener('click', e => {
        const boundingBox = canvas.getBoundingClientRect();
        const x = (e.clientX - boundingBox.x) / boundingBox.width;
        const y = (e.clientY - boundingBox.y) / boundingBox.height;
        if (audio.duration) {
          audio.currentTime = x * audio.duration;
        }
      });
      window.addEventListener('keydown', e => {
        if (e.which === 32) { // space
          if (audio.paused) {
            audio.play();
          } else {
            audio.pause();
          }
        }
      });
      const _bindUpdates = () => {
        const _recurse = () => {
          if (audio.duration) {
            _setX(audio.currentTime / audio.duration);
            requestAnimationFrame(_recurse);
          }
        };
        requestAnimationFrame(_recurse);
      };        
      _bindUpdates();
      
      const audioCtx = new AudioContext();
      //decode an ArrayBuffer into an AudioBuffer
      audioCtx.decodeAudioData(audioData, decodedData => {
        //calculate peaks from an AudioBuffer
        const peaks = extractPeaks(decodedData, audio.duration * 10);
        
        // console.log('got peaks', peaks);
        
        const _samplePeakAt = (f, numSamples) => {
          const peakIndexTarget = f * peaks.length;
          let peakIndex = Math.floor(peakIndexTarget);
          const peakIndexRemainder = peakIndexTarget - peakIndex;

          let v = 0;
          const startPeak = peaks.data[0][peakIndex];
          for (let i = 0; i < numSamples; i++) {
            const j = Math.floor(peakIndex - numSamples / 2) + i;
            if (j >= 0 && j < peaks.data[0].length) {
              v += Math.abs(peaks.data[0][j]);
            }
          }
          v /= numSamples;

          v /= 128;
          // v = Math.abs(v);
          return v;
        };
        const numBars = 256;
        const barWidth = 2 / canvas.width * numBars;
        const barSpacing = 2;
        const fullBarsWidth = numBars * (barWidth + barSpacing);
        for (let i = 0; i < numBars; i++) {
          const v = _samplePeakAt(i / numBars, 16);
          ctx.fillRect(i * (barWidth + barSpacing) * canvas.width / fullBarsWidth, (1-v) * canvas.height / 2, 2 * canvas.width / fullBarsWidth, v * canvas.height);
        }
      });
    },
    'vrm': async ({
      src,
    }) => {
      const o = await _loadVrm(src);
      
      const canvas = document.createElement('canvas');
      canvas.width = window.innerWidth * window.devicePixelRatio;
      canvas.height = window.innerHeight * window.devicePixelRatio;
      const context = canvas.getContext('webgl2');
      const renderer = new THREE.WebGLRenderer({
        canvas,
        context,
      });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(0, o.rig.height, -2);
      const target = new THREE.Vector3(0, o.rig.height / 2, 0);
      camera.lookAt(target);
      
      o.rig.setTopEnabled(false);
      o.rig.setHandEnabled(0, false);
      o.rig.setHandEnabled(1, false);
      o.rig.setBottomEnabled(false);
      o.rig.inputs.hmd.position.y = o.rig.height;
      
      addDefaultLights(scene);
      scene.add(o);
      
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(target);
      
      _setContainerContent(null);
      container.appendChild(canvas);
      
      let lastTimestamp = Date.now();
      const _recurse = () => {
        const now = Date.now();
        const timeDiff = (now - lastTimestamp)/1000;
        controls.update();
        o.rig.update(now, timeDiff);
        renderer.render(scene, camera);
        lastTimestamp = now;
        requestAnimationFrame(_recurse);
      };
      requestAnimationFrame(_recurse);
    },
    'glb': async ({
      src,
    }) => {
      const o = await _loadGltf(src);
      
      const boundingBox = new THREE.Box3().setFromObject(o);
      const center = boundingBox.getCenter(new THREE.Vector3());
      const size = boundingBox.getSize(new THREE.Vector3());
      
      const canvas = document.createElement('canvas');
      canvas.width = window.innerWidth * window.devicePixelRatio;
      canvas.height = window.innerHeight * window.devicePixelRatio;
      const context = canvas.getContext('webgl2');
      const renderer = new THREE.WebGLRenderer({
        canvas,
        context,
      });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.copy(center)
        .add(
          new THREE.Vector3(0, 0.5, 1).normalize()
            .multiplyScalar(Math.max(size.x, size.z))
        );
      camera.lookAt(center);
      
      addDefaultLights(scene);
      scene.add(o);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(center);
      
      _setContainerContent(null);
      container.appendChild(canvas);
      
      // let lastTimestamp = Date.now();
      const _recurse = () => {
        // const now = Date.now();
        // const timeDiff = (now - lastTimestamp)/1000;
        // o.rig.update(now, timeDiff);
        controls.update();
        renderer.render(scene, camera);
        // lastTimestamp = now;
        requestAnimationFrame(_recurse);
      };
      requestAnimationFrame(_recurse);
    },
    'vox': async ({
      src,
    }) => {
      const o = await _loadVox(src);

      const boundingBox = new THREE.Box3().setFromObject(o);
      const center = boundingBox.getCenter(new THREE.Vector3());
      const size = boundingBox.getSize(new THREE.Vector3());
      
      const canvas = document.createElement('canvas');
      canvas.width = window.innerWidth * window.devicePixelRatio;
      canvas.height = window.innerHeight * window.devicePixelRatio;
      const context = canvas.getContext('webgl2');
      const renderer = new THREE.WebGLRenderer({
        canvas,
        context,
      });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.copy(center)
        .add(
          new THREE.Vector3(0, 0.5, 1).normalize()
            .multiplyScalar(Math.max(size.x, size.z))
        );
      camera.lookAt(center);
      
      addDefaultLights(scene);
      scene.add(o);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(center);
      
      _setContainerContent(null);
      container.appendChild(canvas);
      
      // let lastTimestamp = Date.now();
      const _recurse = () => {
        // const now = Date.now();
        // const timeDiff = (now - lastTimestamp)/1000;
        // o.rig.update(now, timeDiff);
        controls.update();
        renderer.render(scene, camera);
        // lastTimestamp = now;
        requestAnimationFrame(_recurse);
      };
      requestAnimationFrame(_recurse);
    },
    'html': async ({
      src,
    }) => {
      const iframe = document.createElement('iframe');
      iframe.classList.add('content');
      iframe.classList.add('iframe');
      _setContainerContent(iframe);

      await new Promise((accept, reject) => {
        iframe.onload = () => {
          accept();
        };
        iframe.onerror = reject;
        iframe.src = src;
      });
    },
  };

  const q = parseQuery(window.location.search);
  const {id, hash, ext} = q;
  const tokenId = parseInt(id, 10);
  
  // container.innerHTML = 'Loading preview:<br>' + JSON.stringify(q, null, 2);
  
  const handler = handlers[ext];
  if (handler) {
    let src;
    if (hash) {
      src = _hashToSrc(hash);
    } else if (!isNaN(tokenId)) {    
      const hash = await _tokenIdToHash(tokenId);
      src = _hashToSrc(hash);
    }

    await handler({
      src,
    });
    
    const m = {
      _preview: true,
      ok: true,
    };
    window.parent.postMessage(m, '*');
  } else {
    const err = new Error('unknown extension: ' + ext);
    const m = {
      _preview: true,
      ok: false,
      error: err.stack,
    };
    window.parent.postMessage(m, '*');

    throw err;
  }
};