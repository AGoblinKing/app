/* global Web3 */
/* eslint no-unused-vars: 0 */
import * as THREE from './three.module.js';
import {BufferGeometryUtils} from './BufferGeometryUtils.js';
import {GLTFLoader} from './GLTFLoader.js';
import {GLTFExporter} from './GLTFExporter.js';
import {TransformControls} from './TransformControls.js';
import {tryLogin, loginManager} from './login.js';
import runtime from './runtime.js';
import flowConstants from './flow-constants.js';
import {parseQuery, hex2Uint8Array, downloadFile, mergeMeshes} from './util.js';
import {rigManager} from './rig.js';
import {makeCubeMesh, /*makeUiFullMesh,*/ makeTextMesh, makeToolsMesh, makeDetailsMesh, makeInventoryMesh, makeColorsMesh, makeIconMesh, intersectUi/*, makeRayMesh*/} from './vr-ui.js';
import {
  THING_SHADER,
  makeDrawMaterial,
} from './shaders.js';
import {lineMeshes, teleportMeshes} from './teleport.js';
import geometryManager from './geometry-manager.js';
import uiManager from './ui-manager.js';
import ioManager from './io-manager.js';
import physicsManager from './physics-manager.js';
import {
  PARCEL_SIZE,
  SUBPARCEL_SIZE,
  SUBPARCEL_SIZE_P1,
  SUBPARCEL_SIZE_P3,
  NUM_PARCELS,
  MAX_NAME_LENGTH,

  numSlices,
  slabRadius,

  chunkDistance,
  BUILD_SNAP,

  colors,
  
  presenceHost,
} from './constants.js';
import {makePromise, getNextMeshId, WaitQueue} from './util.js';
import storage from './storage.js';
import {planet} from './planet.js';
import {player} from './player.js';
import {Bot} from './bot.js';
import {Sky} from './Sky.js';
import {GuardianMesh} from './land.js';
import {storageHost} from './constants.js';
import {renderer, scene, camera, dolly, orbitControls, appManager} from './app-object.js';
import weaponsManager from './weapons-manager.js';
import cameraManager from './camera-manager.js';
import inventory from './inventory.js';
import { App } from './components/App.js';
import { setState } from './state.js';

const zeroVector = new THREE.Vector3(0, 0, 0);
const pid4 = Math.PI / 4;
const leftHandOffset = new THREE.Vector3(0.2, -0.2, -0.3);
const rightHandOffset = new THREE.Vector3(-0.2, -0.2, -0.3);
// const redColorHex = new THREE.Color(0xef5350).multiplyScalar(2).getHex();

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector3 = new THREE.Vector3();
const localVector4 = new THREE.Vector3();
const localVector5 = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();
const localQuaternion2 = new THREE.Quaternion();
const localQuaternion3 = new THREE.Quaternion();
const localEuler = new THREE.Euler();
const localMatrix = new THREE.Matrix4();
const localMatrix2 = new THREE.Matrix4();
const localMatrix3 = new THREE.Matrix4();
const localFrustum = new THREE.Frustum();
const localRaycaster = new THREE.Raycaster();
const localColor = new THREE.Color();
const localObject = new THREE.Object3D();

let skybox = null;

function mod(a, b) {
  return ((a % b) + b) % b;
}

(async () => {
  const q = parseQuery(location.search);
  if (q.w) {
    const url = q.w + '.' + presenceHost;
    await planet.connect({
      online: true,
      roomName: 'lol',
      url,
    });
  } else {
    await planet.connect({
      online: false,
      roomName: 'lol',
    });
  }
  new Bot();
})();

const parcelSize = 10;
const parcelGeometry = (() => {
  const tileGeometry = new THREE.PlaneBufferGeometry(1, 1)
    .applyMatrix4(localMatrix.makeScale(0.95, 0.95, 1))
    .applyMatrix4(localMatrix.makeRotationFromQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)))
    .toNonIndexed();
  const numCoords = tileGeometry.attributes.position.array.length;
  const numVerts = numCoords / 3;
  const positions = new Float32Array(numCoords * parcelSize * parcelSize);
  const centers = new Float32Array(numCoords * parcelSize * parcelSize);
  const typesx = new Float32Array(numVerts * parcelSize * parcelSize);
  const typesz = new Float32Array(numVerts * parcelSize * parcelSize);
  let i = 0;
  for (let x = -parcelSize / 2 + 0.5; x < parcelSize / 2; x++) {
    for (let z = -parcelSize / 2 + 0.5; z < parcelSize / 2; z++) {
      const newTileGeometry = tileGeometry.clone()
        .applyMatrix4(localMatrix.makeTranslation(x, 0, z));
      positions.set(newTileGeometry.attributes.position.array, i * newTileGeometry.attributes.position.array.length);
      for (let j = 0; j < newTileGeometry.attributes.position.array.length / 3; j++) {
        localVector.set(x, 0, z).toArray(centers, i * newTileGeometry.attributes.position.array.length + j * 3);
      }
      let typex = 0;
      if (mod((x + parcelSize / 2 - 0.5), parcelSize) === 0) {
        typex = 1 / 8;
      } else if (mod((x + parcelSize / 2 - 0.5), parcelSize) === parcelSize - 1) {
        typex = 2 / 8;
      }
      let typez = 0;
      if (mod((z + parcelSize / 2 - 0.5), parcelSize) === 0) {
        typez = 1 / 8;
      } else if (mod((z + parcelSize / 2 - 0.5), parcelSize) === parcelSize - 1) {
        typez = 2 / 8;
      }
      for (let j = 0; j < numVerts; j++) {
        typesx[i * numVerts + j] = typex;
        typesz[i * numVerts + j] = typez;
      }
      i++;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  /* geometry.setAttribute('center', new THREE.BufferAttribute(centers, 3));
  geometry.setAttribute('typex', new THREE.BufferAttribute(typesx, 1));
  geometry.setAttribute('typez', new THREE.BufferAttribute(typesz, 1)); */
  return geometry;
})();
const _makeFloorMesh = () => {
  const geometry = parcelGeometry;
  const material = new THREE.MeshBasicMaterial({
    color: 0x333333,
    // opacity: 0.9,
    side: THREE.DoubleSide,
    // transparent: true,
    /* polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1, */
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -0.01;
  mesh.frustumCulled = false;
  return mesh;
};
const floorMesh = _makeFloorMesh();
floorMesh.position.y = 0;
scene.add(floorMesh);

(() => {
  const effectController = {
    turbidity: 2,
    rayleigh: 3,
    mieCoefficient: 0.2,
    mieDirectionalG: 0.9999,
    inclination: 0, // elevation / inclination
    azimuth: 0, // Facing front,
    // exposure: renderer.toneMappingExposure
  };
  const sun = new THREE.Vector3();
  function update() {
    var uniforms = skybox.material.uniforms;
    uniforms.turbidity.value = effectController.turbidity;
    uniforms.rayleigh.value = effectController.rayleigh;
    uniforms.mieCoefficient.value = effectController.mieCoefficient;
    uniforms.mieDirectionalG.value = effectController.mieDirectionalG;

    // effectController.azimuth = (0.05 + ((Date.now() / 1000) * 0.1)) % 1;
    effectController.azimuth = 0.25;
    var theta = Math.PI * (effectController.inclination - 0.5);
    var phi = 2 * Math.PI * (effectController.azimuth - 0.5);

    sun.x = Math.cos(phi);
    sun.y = Math.sin(phi) * Math.sin(theta);
    sun.z = Math.sin(phi) * Math.cos(theta);

    uniforms.sunPosition.value.copy(sun);
  }
  skybox = new Sky();
  skybox.scale.setScalar(1000);
  skybox.update = update;
  skybox.update();
  scene.add(skybox);
})();
(() => {
  const guardianMesh = GuardianMesh([[
    0, 0, SUBPARCEL_SIZE, SUBPARCEL_SIZE,
  ]], 0x42a5f5);
  scene.add(guardianMesh);
})();
/* (async () => {
  const HEIGHTFIELD_SHADER2 = {
    uniforms: {
      map: {
        type: 't',
        value: new THREE.Texture(),
        needsUpdate: true,
      },
      normalMap: {
        type: 't',
        value: new THREE.Texture(),
        needsUpdate: true,
      },
      bumpMap: {
        type: 't',
        value: new THREE.Texture(),
        needsUpdate: true,
      },
      "parallaxScale": { value: 0.5 },
      "parallaxMinLayers": { value: 20 },
      "parallaxMaxLayers": { value: 25 },
    },
    vertexShader: `\
      precision highp float;
      precision highp int;

      uniform sampler2D normalMap;
      varying vec2 vUv;
      varying vec3 vViewPosition;
      // varying vec3 vNormal;
      varying vec3 eyeVec;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        vViewPosition = -mvPosition.xyz;
        //vNormal = normalize( normalMatrix * normal );
        // vNormal = normalize( normalMatrix * texture2D( normalMap, vUv ).rgb );
        gl_Position = projectionMatrix * mvPosition;
        eyeVec = vViewPosition.xyz;
      }
    `,
    fragmentShader: `\
      precision highp float;
      precision highp int;

      uniform sampler2D bumpMap;
      uniform sampler2D map;
      uniform float parallaxScale;
      uniform float parallaxMinLayers;
      uniform float parallaxMaxLayers;
      varying vec2 vUv;
      varying vec3 vViewPosition;
      // varying vec3 vNormal;
      varying vec3 eyeVec;

        vec2 parallaxMap( in vec3 V ) {
          float numLayers = mix( parallaxMaxLayers, parallaxMinLayers, abs( dot( vec3( 0.0, 0.0, 1.0 ), V ) ) );
          float layerHeight = 1.0 / numLayers;
          float currentLayerHeight = 0.0;
          vec2 dtex = parallaxScale * V.xy / V.z / numLayers;
          vec2 currentTextureCoords = vUv;
          float heightFromTexture = texture2D( bumpMap, currentTextureCoords ).r;
          for ( int i = 0; i < 30; i += 1 ) {
            if ( heightFromTexture <= currentLayerHeight ) {
              break;
            }
            currentLayerHeight += layerHeight;
            currentTextureCoords -= dtex;
            heightFromTexture = texture2D( bumpMap, currentTextureCoords ).r;
          }
            vec2 prevTCoords = currentTextureCoords + dtex;
            float nextH = heightFromTexture - currentLayerHeight;
            float prevH = texture2D( bumpMap, prevTCoords ).r - currentLayerHeight + layerHeight;
            float weight = nextH / ( nextH - prevH );
            return prevTCoords * weight + currentTextureCoords * ( 1.0 - weight );
        }
      vec2 perturbUv( vec3 surfPosition, vec3 surfNormal, vec3 viewPosition ) {
        vec2 texDx = dFdx( vUv );
        vec2 texDy = dFdy( vUv );
        vec3 vSigmaX = dFdx( surfPosition );
        vec3 vSigmaY = dFdy( surfPosition );
        vec3 vR1 = cross( vSigmaY, surfNormal );
        vec3 vR2 = cross( surfNormal, vSigmaX );
        float fDet = dot( vSigmaX, vR1 );
        vec2 vProjVscr = ( 1.0 / fDet ) * vec2( dot( vR1, viewPosition ), dot( vR2, viewPosition ) );
        vec3 vProjVtex;
        vProjVtex.xy = texDx * vProjVscr.x + texDy * vProjVscr.y;
        vProjVtex.z = dot( surfNormal, viewPosition );
        return parallaxMap( vProjVtex );
      }
      void main() {
        vec3 vNormal = normalize(cross(dFdx(eyeVec.xyz), dFdy(eyeVec.xyz)));
        vec2 mapUv = perturbUv( -vViewPosition, normalize( vNormal ), normalize( vViewPosition ) );
        gl_FragColor = texture2D( map, mapUv );
      }
    `,
  };
  const geometry = new THREE.SphereBufferGeometry(1, 32, 32);
  const heightfieldMaterial2 = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(HEIGHTFIELD_SHADER2.uniforms),
    vertexShader: HEIGHTFIELD_SHADER2.vertexShader,
    fragmentShader: HEIGHTFIELD_SHADER2.fragmentShader,
    extensions: {
      derivatives: true,
    },
  });
  heightfieldMaterial2.uniforms.map.value.image = await new Promise((accept, reject) => {
    const img = new Image();
    img.onload = () => {
      accept(img);
    };
    img.onerror = reject;
    img.src = `./land-textures/Vol_21_4_Base_Color.png`;
  });
  heightfieldMaterial2.uniforms.map.value.wrapS = THREE.RepeatWrapping;
  heightfieldMaterial2.uniforms.map.value.wrapT = THREE.RepeatWrapping;
  heightfieldMaterial2.uniforms.map.value.needsUpdate = true;
  heightfieldMaterial2.uniforms.bumpMap.value.image = await new Promise((accept, reject) => {
    const img = new Image();
    img.onload = () => {
      accept(img);
    };
    img.onerror = reject;
    img.src = `./land-textures/Vol_21_4_Height.png`;
  });
  heightfieldMaterial2.uniforms.bumpMap.value.wrapS = THREE.RepeatWrapping;
  heightfieldMaterial2.uniforms.bumpMap.value.wrapT = THREE.RepeatWrapping;
  heightfieldMaterial2.uniforms.bumpMap.value.needsUpdate = true;

  const mesh = new THREE.Mesh(geometry, heightfieldMaterial2);
  mesh.position.x = -5;
  scene.add(mesh);
})(); */

(async () => {
  rigManager.addPeerRig(-1);
  rigManager.setPeerAvatarUrl('./npc.vrm', -1);
  rigManager.setPeerAvatarName('Lollercopter', -1);
  // rigManager.setPeerAvatarUrl('./model.glb', -1);
  setInterval(() => {
    rigManager.setPeerAvatarPose([
      [[0, 1, 0], [0, 0, 0, 1]],
      [[0, 0, 0], [0, 0, 0, 1], 0, 0],
      [[0, 0, 0], [0, 0, 0, 1], 0, 0],
      0
    ], -1);
  }, 100);

  /* {
    const u = 'lightsaber.wbn';
    const res = await fetch('./' + u);
    const file = await res.blob();
    file.name = u;
    // console.log('loading file');
    const mesh = await runtime.loadFileForWorld(file);
    mesh.run();
    console.log('loaded file', mesh);
    scene.add(mesh);
  } */
  /* {
    const u = 'comet.wbn';
    const res = await fetch('./' + u);
    const file = await res.blob();
    file.name = u;
    // console.log('loading file');
    const mesh = await runtime.loadFileForWorld(file);
    scene.run();
    // console.log('loaded file', mesh);
    scene.add(mesh);
  } */
  /* {
    const u = 'shield.wbn';
    const res = await fetch('./' + u);
    const file = await res.blob();
    file.name = u;
    // console.log('loading file');
    const mesh = await runtime.loadFileForWorld(file);
    mesh.run();
    // console.log('loaded file', mesh);
    scene.add(mesh);
  } */
  /* {
    const u = 'female.glb';
    const res = await fetch('./' + u);
    const file = await res.blob();
    file.name = u;
    // console.log('loading file');
    const mesh = await runtime.loadFileForWorld(file);
    console.log('loaded file', mesh);
    scene.add(mesh);
  } */
})();

/* const redBuildMeshMaterial = new THREE.ShaderMaterial({
  vertexShader: `
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position * 1.05, 1.);
    }
  `,
  fragmentShader: `
    void main() {
      gl_FragColor = vec4(${new THREE.Color(0xff7043).toArray().join(', ')}, 0.5);
    }
  `,
  // side: THREE.DoubleSide,
  transparent: true,
}); */

/* const jointGeometry = new THREE.BoxBufferGeometry(0.01, 0.01, 0.01);
const jointPositions = jointGeometry.attributes.position.array.slice();
const jointNumPositions = jointPositions.length;
const jointMaterial = new THREE.MeshBasicMaterial({
  color: 0xFF0000,
});
const handGeometry = (() => {
  const geometries = Array(25);
  for (let i = 0; i < geometries.length; i++) {
    geometries[i] = jointGeometry;
  }
  return BufferGeometryUtils.mergeBufferGeometries(geometries);
})();
const handMeshes = (() => {
  const result = Array(2);
  for (let i = 0; i < result.length; i++) {
    const mesh = new THREE.Mesh(handGeometry.clone(), jointMaterial);
    mesh.visible = false;
    mesh.frustumCulled = false;
    result[i] = mesh;
  }
  return result;
})();
for (const handMesh of handMeshes) {
  scene.add(handMesh);
} */

const tetrehedronGeometry = (() => {
  const geometry = new THREE.TetrahedronBufferGeometry(0.2, 0);
  const barycentrics = new Float32Array(geometry.attributes.position.array.length);
  let barycentricIndex = 0;
  for (let i = 0; i < geometry.attributes.position.array.length; i += 9) {
    barycentrics[barycentricIndex++] = 1;
    barycentrics[barycentricIndex++] = 0;
    barycentrics[barycentricIndex++] = 0;
    barycentrics[barycentricIndex++] = 0;
    barycentrics[barycentricIndex++] = 1;
    barycentrics[barycentricIndex++] = 0;
    barycentrics[barycentricIndex++] = 0;
    barycentrics[barycentricIndex++] = 0;
    barycentrics[barycentricIndex++] = 1;
  }
  geometry.setAttribute('barycentric', new THREE.BufferAttribute(barycentrics, 3));
  return geometry;
})();

/* const rayMesh = makeRayMesh();
scene.add(rayMesh);

const highlightScene = new THREE.Scene();
const highlightMesh = makeHighlightMesh();
highlightScene.add(highlightMesh);

const wristMenu = makeWristMenu({scene, ray: rayMesh, highlightMesh, addPackage: _addPackage});
wristMenu.position.y = 1;
scene.add(wristMenu); */

/* window.downloadTargetMesh = async () => {
  const {GLTFExporter} = await import('./GLTFExporter.js');
  const targetMesh = _makeTargetMesh();
  targetMesh.material = new THREE.MeshBasicMaterial({
    color: 0x000000,
  });
  const data = await new Promise((accept, reject) => {
    const exporter = new GLTFExporter();
    const exportScene = new THREE.Scene();
    exportScene.add(targetMesh);
    exporter.parse(exportScene, gltf => {
      accept(gltf);
    }, {
      binary: true,
      includeCustomExtensions: true,
    });
  });
  console.log('got data', data);
  const b = new Blob([data], {
    type: 'application/octet-stream',
  });
  downloadFile(b, 'target.glb');
}; */

/* const _getCurrentParcel = p => new THREE.Vector3(
  Math.floor((p.x+5)/10),
  0,
  Math.floor((p.z+5)/10),
);
let planetAnimation = null;
const _animatePlanet = (startMatrix, pivot, startQuaternion, endQuaternion) => {
  const startTime = Date.now();
  const endTime = startTime + 300;
  planetAnimation = {
    startTime,
    endTime,
    startMatrix,
    pivot,
    startQuaternion,
    endQuaternion,
  };
  planetAuxContainer.matrix
    .copy(startMatrix)
    .premultiply(localMatrix2.makeTranslation(-pivot.x, -pivot.y, -pivot.z))
    .premultiply(localMatrix2.makeRotationFromQuaternion(localQuaternion.copy(startQuaternion).slerp(endQuaternion, 1)))
    .premultiply(localMatrix2.makeTranslation(pivot.x, pivot.y, pivot.z))
    .decompose(planetAuxContainer.position, planetAuxContainer.quaternion, planetAuxContainer.scale)
  planetAuxContainer.updateMatrixWorld();
};
const _tickPlanetAnimation = factor => {
  const {startTime, endTime, startMatrix, pivot, startQuaternion, endQuaternion} = planetAnimation;
  planetContainer.matrix
    .copy(startMatrix)
    .premultiply(localMatrix2.makeTranslation(-pivot.x, -pivot.y, -pivot.z))
    .premultiply(localMatrix2.makeRotationFromQuaternion(localQuaternion.copy(startQuaternion).slerp(endQuaternion, factor)))
    .premultiply(localMatrix2.makeTranslation(pivot.x, pivot.y, pivot.z))
    .decompose(planetContainer.position, planetContainer.quaternion, planetContainer.scale);
  if (factor >= 1) {
    planetAnimation = null;
  }
}; */

const timeFactor = 60 * 1000;
let lastTimestamp = performance.now();
const startTime = Date.now();
function animate(timestamp, frame) {
  timestamp = timestamp || performance.now();
  const timeDiff = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
  lastTimestamp = timestamp;

  const now = Date.now();
  if (skybox) {
    for (const material of geometryManager.currentChunkMesh.material) {
      const {uniforms} = material;
      uniforms.uTime.value = (now % timeFactor) / timeFactor;
      uniforms.uTime.needsUpdate = true;
      uniforms.sunIntensity.value = Math.max(skybox.material.uniforms.sunPosition.value.y, 0);
      uniforms.sunIntensity.needsUpdate = true;
      uniforms.sunDirection.value.copy(skybox.material.uniforms.sunPosition.value).normalize();
      window.sunDirection = uniforms.sunDirection.value;
      uniforms.sunDirection.needsUpdate = true;
    }
  }
  if (skybox) {
    for (const material of geometryManager.currentVegetationMesh.material) {
      const {uniforms} = material;
      uniforms.sunIntensity.value = Math.max(skybox.material.uniforms.sunPosition.value.y, 0);
      uniforms.sunIntensity.needsUpdate = true;
    }
  }
  // if (geometryManager.currentVegetationMesh) {
    geometryManager.currentVegetationMesh.hitTracker.update();
  // }

  skybox.position.copy(rigManager.localRig.inputs.hmd.position);
  skybox.update();

  ioManager.update(timeDiff, frame);
  physicsManager.update(timeDiff, frame);
  uiManager.update(timeDiff, frame);

  const _updateRig = () => {
    let hmdPosition, hmdQuaternion;
    let leftGamepadPosition, leftGamepadQuaternion, leftGamepadPointer, leftGamepadGrip;
    let rightGamepadPosition, rightGamepadQuaternion, rightGamepadPointer, rightGamepadGrip;

    if (rigManager.localRigMatrixEnabled) {
      localMatrix.copy(rigManager.localRigMatrix);
      // .premultiply(localMatrix2.getInverse(this.matrix))
      // .toArray(xrState.poseMatrix);
    } else {
      localMatrix.copy(camera.matrixWorld);
      // .getInverse(localMatrix)
      // .premultiply(localMatrix2.getInverse(this.matrix))
      // .toArray(xrState.poseMatrix);
    }
    localMatrix // .fromArray(this.xrState.poseMatrix)
      .decompose(localVector, localQuaternion, localVector2);
    hmdPosition = localVector.toArray();
    hmdQuaternion = localQuaternion.toArray();

    const session = renderer.xr.getSession();
    if (session) {
      let inputSources = Array.from(session.inputSources);
      inputSources = ['right', 'left']
        .map(handedness => inputSources.find(inputSource => inputSource.handedness === handedness));
      let pose;
      if (inputSources[0] && (pose = frame.getPose(inputSources[0].targetRaySpace, renderer.xr.getReferenceSpace()))) {
        localMatrix.fromArray(pose.transform.matrix)
          .premultiply(dolly.matrix)
          .decompose(localVector2, localQuaternion2, localVector3);
        leftGamepadPosition = localVector2.toArray();
        leftGamepadQuaternion = localQuaternion2.toArray();

        const {gamepad} = inputSources[0];
        if (gamepad && gamepad.buttons.length >= 2) {
          const {buttons} = gamepad;
          leftGamepadPointer = buttons[0].value;
          leftGamepadGrip = buttons[1].value;
        } else {
          leftGamepadPointer = 0;
          leftGamepadGrip = 0;
        }
      }
      if (inputSources[1] && (pose = frame.getPose(inputSources[1].targetRaySpace, renderer.xr.getReferenceSpace()))) {
        localMatrix.fromArray(pose.transform.matrix)
          .premultiply(dolly.matrix)
          .decompose(localVector2, localQuaternion2, localVector3);
        rightGamepadPosition = localVector2.toArray();
        rightGamepadQuaternion = localQuaternion2.toArray();

        const {gamepad} = inputSources[1];
        if (gamepad && gamepad.buttons.length >= 2) {
          const {buttons} = gamepad;
          rightGamepadPointer = buttons[0].value;
          rightGamepadGrip = buttons[1].value;
        } else {
          rightGamepadPointer = 0;
          rightGamepadGrip = 0;
        }
      }

      /* const _scaleMatrixPQ = (srcMatrixArray, p, q) => {
        localMatrix.fromArray(srcMatrixArray)
          .decompose(localVector, localQuaternion, localVector2);
        localVector.divideScalar(this.scale);
        localVector.toArray(p);
        localQuaternion.toArray(q);
      };
      const _loadInputSource = i => {
        const inputSource = inputSources[i];
        if (inputSource) {
          let gamepad, pose, hand;
          if (
            (gamepad = inputSource.gamepad || gamepads[i]) &&
            (pose = frame.getPose(inputSource.targetRaySpace, this.referenceSpace))
          ) {
            const xrGamepad = xrState.gamepads[inputSource.handedness === 'right' ? 1 : 0];
            _scaleMatrixPQ(pose.transform.matrix, xrGamepad.position, xrGamepad.orientation);

            for (let j = 0; j < gamepad.buttons.length; j++) {
              const button = gamepad.buttons[j];
              const xrButton = xrGamepad.buttons[j];
              xrButton.pressed[0] = button.pressed;
              xrButton.touched[0] = button.touched;
              xrButton.value[0] = button.value;
            }

            for (let j = 0; j < gamepad.axes.length; j++) {
              xrGamepad.axes[j] = gamepad.axes[j];
            }

            xrGamepad.connected[0] = 1;
          } else if (
            (hand = inputSource.hand)
          ) {
            const xrHand = xrState.hands[inputSource.handedness === 'right' ? 1 : 0];
            for (let i = 0; i < inputSource.hand.length; i++) {
              const joint = inputSource.hand[i];
              const xrHandJoint = xrHand[i];

              const jointPose = joint && frame.getJointPose(joint, this.referenceSpace);
              if (jointPose) {
                _scaleMatrixPQ(jointPose.transform.matrix, xrHandJoint.position, xrHandJoint.orientation);
                xrHandJoint.radius[0] = jointPose.radius;
                xrHandJoint.visible[0] = 1;
              } else {
                xrHandJoint.visible[0] = 0;
              }
            }
            xrHand.visible[0] = 1;
          }
        }
      };
      for (let i = 0; i < xrState.gamepads.length; i++) {
        xrState.gamepads[i].connected[0] = 0;
      }
      for (let i = 0; i < xrState.hands.length; i++) {
        xrState.hands[i].visible[0] = 0;
      }
      for (let i = 0; i < inputSources.length; i++) {
        _loadInputSource(i);
      } */

      /* localMatrix2.getInverse(this.matrix);
      localMatrix3
        .compose(localVector.fromArray(xrState.gamepads[1].position), localQuaternion.fromArray(xrState.gamepads[1].orientation), localVector2.set(1, 1, 1))
        .premultiply(localMatrix2)
        .decompose(localVector2, localQuaternion2, localVector3);
      leftGamepadPosition = localVector2.toArray();
      leftGamepadQuaternion = localQuaternion2.toArray();
      leftGamepadPointer = xrState.gamepads[1].buttons[0].value;
      leftGamepadGrip = xrState.gamepads[1].buttons[1].value;

      localMatrix3
        .compose(localVector.fromArray(xrState.gamepads[0].position), localQuaternion.fromArray(xrState.gamepads[0].orientation), localVector2.set(1, 1, 1))
        .premultiply(localMatrix2)
        .decompose(localVector2, localQuaternion2, localVector3);
      rightGamepadPosition = localVector2.toArray();
      rightGamepadQuaternion = localQuaternion2.toArray();
      rightGamepadPointer = xrState.gamepads[0].buttons[0].value;
      rightGamepadGrip = xrState.gamepads[0].buttons[1].value;

      if (xrState.hands[1].visible[0]) {
        for (let i = 0; i < 25; i++) {
          rig.inputs.leftGamepad.fingers[i].quaternion.fromArray(xrState.hands[1][i].orientation);
        }
      }
      rig.inputs.rightGamepad.pointer = xrState.gamepads[0].buttons[0].value;
      rig.inputs.rightGamepad.grip = xrState.gamepads[0].buttons[1].value;
      if (xrState.hands[0].visible[0]) {
        for (let i = 0; i < 25; i++) {
          rig.inputs.rightGamepad.fingers[i].quaternion.fromArray(xrState.hands[0][i].orientation);
        }
      } */
    }

    const handOffsetScale = rigManager.localRig ? rigManager.localRig.height / 1.5 : 1;
    if (!leftGamepadPosition) {
      leftGamepadPosition = localVector2.copy(localVector).add(localVector3.copy(leftHandOffset).multiplyScalar(handOffsetScale).applyQuaternion(localQuaternion)).toArray();
      // .toArray(xrState.gamepads[1].position);
      leftGamepadQuaternion = localQuaternion.toArray();
      leftGamepadPointer = 0;
      leftGamepadGrip = 0;
    }
    if (!rightGamepadPosition) {
      rightGamepadPosition = localVector2.copy(localVector).add(localVector3.copy(rightHandOffset).multiplyScalar(handOffsetScale).applyQuaternion(localQuaternion)).toArray();
      // .toArray(xrState.gamepads[0].position);
      rightGamepadQuaternion = localQuaternion.toArray();
      rightGamepadPointer = 0;
      rightGamepadGrip = 0;
    }

    /* HANDS.forEach((handedness, i) => {
      const grabuse = this.grabuses[handedness];
      const gamepad = xrState.gamepads[i];
      const button = gamepad.buttons[0];
      if (grabuse) {
        button.touched[0] = 1;
        button.pressed[0] = 1;
        button.value[0] = 1;
      } else {
        button.touched[0] = 0;
        button.pressed[0] = 0;
        button.value[0] = 0;
      }
    }); */

    rigManager.setLocalAvatarPose([
      [localVector.toArray(), localQuaternion.toArray()],
      [leftGamepadPosition, leftGamepadQuaternion, leftGamepadPointer, leftGamepadGrip],
      [rightGamepadPosition, rightGamepadQuaternion, rightGamepadPointer, rightGamepadGrip],
    ]);
    rigManager.update();
  };
  _updateRig();

  // const {leftGamepad: rightGamepad, rightGamepad: leftGamepad} = rigManager.localRig.inputs;

  orbitControls.enabled = cameraManager.getTool() === 'camera';

  weaponsManager.update(timeDiff, frame);

  /* const _updateHands = () => {
    const session = renderer.xr.getSession();
    if (session) {
      const inputSource = session.inputSources[1];
      let pose;
      const referenceSpace = renderer.xr.getReferenceSpace();
      if (inputSource && (pose = frame.getPose(inputSource.targetRaySpace, referenceSpace))) {
        for (const handMesh of handMeshes) {
          handMesh.visible = false;
        }
        for (const inputSource of session.inputSources) {
          if (inputSource && inputSource.hand) {
            const handMesh = handMeshes[inputSource.handedness === 'right' ? 1 : 0];
            const positionAttribute = handMesh.geometry.attributes.position;

            for (let i = 0; i < inputSource.hand.length; i++) {
              const joint = inputSource.hand[i];
              const dstPositions = new Float32Array(positionAttribute.array.buffer, positionAttribute.array.byteOffset + i * jointNumPositions * Float32Array.BYTES_PER_ELEMENT, jointNumPositions);

              const jointPose = joint && frame.getJointPose(joint, referenceSpace);
              if (jointPose) {
                jointGeometry.attributes.position.array.set(jointPositions);
                jointGeometry.applyMatrix4(
                  localMatrix.fromArray(jointPose.transform.matrix),
                );
                dstPositions.set(jointGeometry.attributes.position.array);
              } else {
                dstPositions.fill(0);
              }
            }
            positionAttribute.needsUpdate = true;
            handMesh.visible = true;
          }
        }
      }
    }
  };
  _updateHands(); */

  /* if (planetAnimation) {
    const {startTime, endTime} = planetAnimation;
    const now = Date.now();
    const factor = Math.min((now - startTime) / (endTime - startTime), 1);
    _tickPlanetAnimation(factor);
  } */

  if (cameraManager.getTool() === 'firstperson') {
    rigManager.localRig.decapitate();
  } else {
    rigManager.localRig.undecapitate();
  }

  geometryManager.update(timeDiff, frame);
  planet.update();

  appManager.tick(timestamp, frame);
  
  ioManager.updatePost(timeDiff);

  const xrCamera = renderer.xr.getSession() ? renderer.xr.getCamera(camera) : camera;
  localMatrix.multiplyMatrices(xrCamera.projectionMatrix, localMatrix2.multiplyMatrices(xrCamera.matrixWorldInverse, geometryManager.worldContainer.matrixWorld));
  localMatrix3.copy(xrCamera.matrix)
    .premultiply(dolly.matrix)
    .premultiply(localMatrix2.getInverse(geometryManager.worldContainer.matrixWorld))
    .decompose(localVector, localQuaternion, localVector2);

  const [landGroups, vegetationGroups, thingGroups] = geometryManager.geometryWorker.tickCull(geometryManager.tracker, localVector, localMatrix);
  geometryManager.currentChunkMesh.geometry.groups = landGroups;
  geometryManager.currentVegetationMesh.geometry.groups = vegetationGroups;
  geometryManager.currentThingMesh.geometry.groups = thingGroups;

  renderer.render(scene, camera);
  // renderer.render(highlightScene, camera);
}
geometryManager.waitForLoad().then(e => {
  setTimeout(() => {
    renderer.setAnimationLoop(animate);
  });
});

/* const loadVsh = `
  #define M_PI 3.1415926535897932384626433832795
  uniform float uTime;
  
  mat4 rotationMatrix(vec3 axis, float angle)
  {
      axis = normalize(axis);
      float s = sin(angle);
      float c = cos(angle);
      float oc = 1.0 - c;
      
      return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
                  oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
                  oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
                  0.0,                                0.0,                                0.0,                                1.0);
  }

  void main() {
    // float f = 1.0 + pow(sin(uTime * M_PI), 0.5) * 0.2;
    gl_Position = projectionMatrix * modelViewMatrix * rotationMatrix(vec3(0, 0, 1), -uTime * M_PI * 2.0) * vec4(position, 1.);
  }
`;
const loadFsh = `
  uniform float uHighlight;
  uniform float uTime;
  void main() {
    float f = 1.0 + max(1.0 - uTime, 0.0);
    gl_FragColor = vec4(vec3(${new THREE.Color(0xf4511e).toArray().join(', ')}) * f, 1.0);
  }
`;
const loadMeshMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: {
      type: 'f',
      value: 0,
    },
  },
  vertexShader: loadVsh,
  fragmentShader: loadFsh,
  side: THREE.DoubleSide,
});
const _makeLoadMesh = (() => {
  const geometry = new THREE.RingBufferGeometry(0.05, 0.08, 128, 0, Math.PI / 2, Math.PI * 2 * 0.9);
  // .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)));
  return () => {
    const mesh = new THREE.Mesh(geometry, loadMeshMaterial);
    // mesh.frustumCulled = false;
    return mesh;
  };
})();
const _ensureLoadMesh = p => {
  if (!p.loadMesh) {
    p.loadMesh = _makeLoadMesh();
    p.loadMesh.matrix.copy(p.matrix).decompose(p.loadMesh.position, p.loadMesh.quaternion, p.loadMesh.scale);
    scene.add(p.loadMesh);

    p.waitForRun()
      .then(() => {
        p.loadMesh.visible = false;
      });
  }
}; */

const _initializeLogin = async () => {
  await tryLogin();

  const _initializeUserUi = async () => {
    await geometryManager.waitForLoad();

    const files = inventory.getFiles();
    uiManager.inventoryMesh.inventoryItemsMesh.update(files);
    
    inventory.addEventListener('filesupdate', e => {
      const files = e.data;
      uiManager.inventoryMesh.inventoryItemsMesh.update(files);
    });
    
    const _listenBlockchainEvents = async () => {
      const address = '0x' + loginManager.getAddress();

      const loadPromise = makePromise();
      loginManager.getBalance()
        .then(balance => {
          uiManager.tradeMesh.setBalance(balance);
          loadPromise.accept();
        });

      const s = new WebSocket('wss://events.exokit.org/');
      s.onopen = () => {
        s.onmessage = async e => {
          const s = e.data;
          const tx = JSON.parse(s);
          await loadPromise;
          if (tx.from && tx.to && tx.amount) {
            uiManager.popupMesh.addMessage(`${tx.from} sent ${tx.to} ${tx.amount}`);
          }
          if (tx.from === address) {
            let balance = uiManager.tradeMesh.getBalance();
            const oldBalance = balance;
            balance -= tx.amount;
            uiManager.tradeMesh.setBalance(balance);
          }
          if (tx.to === address) {
            let balance = uiManager.tradeMesh.getBalance();
            const oldBalance = balance;
            balance += tx.amount;
            uiManager.tradeMesh.setBalance(balance);
          }
        };
      };
      s.onerror = err => {
        console.warn('events websocket error', err);
      };
      s.onclose = () => {
        console.warn('events websocket closed');
      };
    };
    _listenBlockchainEvents();
  };
  _initializeUserUi();
  const _initializeRigUi = () => {
    const username = loginManager.getUsername() || 'Anonymous';
    rigManager.setLocalAvatarName(username);
    loginManager.addEventListener('usernamechange', e => {
      const username = e.data || 'Anonymous';
      rigManager.setLocalAvatarName(username);
    });

    const avatarHash = loginManager.getAvatar();
    if (avatarHash) {
      rigManager.setLocalAvatarUrl(`${storageHost}/${avatarHash}`);
    }
    loginManager.addEventListener('avatarchange', e => {
      const avatarHash = e.data;
      if (avatarHash) {
        rigManager.setLocalAvatarUrl(`${storageHost}/${avatarHash}`);
      } else {
        rigManager.addLocalRig(null);
      }
    });
  };
  _initializeRigUi();
};
_initializeLogin();

const _initializeXr = () => {
  let currentSession = null;
  function onSessionStarted(session) {
    session.addEventListener('end', onSessionEnded);
    renderer.xr.setSession(session);
    // renderer.xr.setReferenceSpaceType('local-floor');
    currentSession = session;
    setState({ isXR: true })
  }
  function onSessionEnded() {
    currentSession.removeEventListener('end', onSessionEnded);
    renderer.xr.setSession(null);
    currentSession = null;
    setState({ isXR: false })
  }
  document.getElementById('enter-xr-button').addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (currentSession === null) {
      navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: [
          'local-floor',
          // 'bounded-floor',
        ],
        optionalFeatures: [
          'hand-tracking',
        ],
      }).then(onSessionStarted);
    } else {
      currentSession.end();
    }
  });
};
_initializeXr();