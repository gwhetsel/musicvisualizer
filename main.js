import * as THREE from "three";
import { GUI } from "dat.gui";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

let currentFrequency = 0;
let slider;
let playPauseButton;
let audioStartTime = 0;
let isPlaying = false;
let lastPlaybackTime = 0; // track last playback time
const defaultAudioPath = "./music/bodies.mp3"; // default audio
let currentFileName = "bodies.mp3"; // default file name

// scene and camera setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 30);
scene.add(camera);

// bloom/post-processing setup
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.7, 0.5);
const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);
// set initial bloom values
bloomPass.threshold = 0;
bloomPass.strength = 0.7;
bloomPass.radius = 0;

// gui parameters
const params = {
    red: 0.0,
    green: 0.02,
    blue: 0.5,
    threshold: 0.0,
    strength: 0.7,
    radius: 0.0,
    noiseScale: 1.5,
    displacementScale: 3.0,
    frequencyScale: 100.0,
    fileName: currentFileName,
    volume: 0.5, // initial volume
};

// shader uniforms
const uniforms = {
    u_time: { value: 0.0 },
    u_frequency: { value: 0.0 },
    u_red: { value: params.red },
    u_green: { value: params.green },
    u_blue: { value: params.blue },
    u_noiseScale: { value: params.noiseScale },
    u_displacementScale: { value: params.displacementScale },
};

// particle sphere
const sphereGeometry = new THREE.SphereGeometry(8, 20, 20);
const sphereMaterial = new THREE.PointsMaterial({
    size: 0.2,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    color: new THREE.Color('#ffffff'),
});
const sphere = new THREE.Points(sphereGeometry, sphereMaterial);
scene.add(sphere);

// shader material (vertex/fragment)
const vertexShader = document.getElementById("vertexShader").textContent;
const fragmentShader = document.getElementById("fragmentShader").textContent;
const shaderMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});

// sphere where noise is applied
const noiseSphereGeometry = new THREE.IcosahedronGeometry(5, 200);
const noiseSphere = new THREE.Mesh(noiseSphereGeometry, shaderMaterial);
scene.add(noiseSphere);

// glowing particle system
const particleCount = 1200;
const particles = new THREE.BufferGeometry();
const positions = [];

for (let i = 0; i < particleCount; i++) {
    positions.push(
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 40
    );
}
particles.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

// particles texture (circle sprite)
const particleTexture = new THREE.TextureLoader().load("./textures/star.png");
const particleMaterial = new THREE.PointsMaterial({
    size: 0.2,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: new THREE.Color(params.red, params.green, params.blue), // changes with gui
    map: particleTexture, // use sprite texture
});
const particleSystem = new THREE.Points(particles, particleMaterial);
scene.add(particleSystem);

// inner sphere
const innerSphereGeometry = new THREE.SphereGeometry(2.5, 32, 32);
const innerSphereMaterial = new THREE.MeshBasicMaterial();
const innerSphere = new THREE.Mesh(innerSphereGeometry, innerSphereMaterial);
scene.add(innerSphere);

// audio variables
const listener = new THREE.AudioListener();
camera.add(listener);
const sound = new THREE.Audio(listener);
const audioLoader = new THREE.AudioLoader();
let analyser;

// reset audio
function resetAudioState() {
    lastPlaybackTime = 0;
    audioStartTime = 0; // reset audio start time
    if (slider) {
        slider.value = 0; // reset slider
    }
}

// add track slider and play/pause
function addAudioControls(sound) {
    const controlsContainer = document.createElement("div");
    controlsContainer.style.position = "absolute";
    controlsContainer.style.bottom = "10px";
    controlsContainer.style.width = "100%";
    controlsContainer.style.textAlign = "center";
    document.body.appendChild(controlsContainer);

    playPauseButton = document.createElement("button");
    playPauseButton.textContent = "Play";
    playPauseButton.style.marginRight = "10px";
    controlsContainer.appendChild(playPauseButton);

    slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = "0";
    slider.style.width = "80%";
    controlsContainer.appendChild(slider);

    let buttonLock = false; // to ensure state change doesn't cause problems (play/pause, change track time)

    playPauseButton.addEventListener("click", async () => {
        if (buttonLock) return;
        buttonLock = true;

        setTimeout(() => (buttonLock = false), 200); // 200ms cooldown
        await sound.context.resume();

        if (isPlaying) {
            const currentTime = sound.context.currentTime - audioStartTime; // set current time properly
            lastPlaybackTime = currentTime % sound.buffer.duration;
            sound.stop();
            playPauseButton.textContent = "Play";
        } else {
            sound.offset = lastPlaybackTime;
            sound.play();
            audioStartTime = sound.context.currentTime - lastPlaybackTime;
            playPauseButton.textContent = "Pause";
        }

        isPlaying = !isPlaying;
    });

    function updateSlider() {
        if (isPlaying) {
            const currentTime = sound.context.currentTime - audioStartTime;
            slider.value = ((currentTime % sound.buffer.duration) / sound.buffer.duration) * 100; // update slider value
        }
        requestAnimationFrame(updateSlider);
    }

    updateSlider();

    slider.addEventListener("input", () => {
        const seekTime = (slider.value / 100) * sound.buffer.duration; // for skipping to certain time
        sound.stop();
        sound.offset = seekTime;
        lastPlaybackTime = seekTime;

        if (isPlaying) {
            sound.play();
            audioStartTime = sound.context.currentTime - seekTime;
        }
    });
}

// load a new audio file
function loadAudioFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const audioData = event.target.result;
        audioLoader.load(audioData, (buffer) => {
            currentFileName = file.name;
            params.fileName = currentFileName;
            gui.updateDisplay(); // update file name in gui
            sound.setBuffer(buffer);

            // reset audio
            resetAudioState();

            // pause if playing
            if (isPlaying) {
                sound.stop();
                isPlaying = false;
                playPauseButton.textContent = "Play"; // update button to show play
            }
        });
    };
    reader.onerror = () => {
        console.error("Failed to read audio file.");
        loadDefaultAudio();
    };
    reader.readAsDataURL(file);
}

// load the default audio file
function loadDefaultAudio() {
    currentFileName = "bodies.mp3";
    params.fileName = currentFileName;
    gui.updateDisplay(); // update file name in gui
    audioLoader.load(defaultAudioPath, (buffer) => {
        sound.setBuffer(buffer);
        sound.setLoop(true);
        sound.setVolume(params.volume); // set initial volume
        resetAudioState(); // reset audio before adding controls
        addAudioControls(sound);
        analyser = new THREE.AudioAnalyser(sound, 256);
    });
}

// update the color of particles
function updateParticleColors() {
    particleMaterial.color = new THREE.Color(params.red, params.green, params.blue);
}

// reset button functionality
function resetParameters() {
    // update params
    params.red = 0.0;
    params.green = 0.02;
    params.blue = 0.5;
    params.threshold = 0.0;
    params.strength = 0.7;
    params.radius = 0.0;
    params.noiseScale = 1.5;
    params.displacementScale = 3.0;
    params.volume = 0.5;
    params.fileName = currentFileName;

    // update uniforms
    uniforms.u_red.value = params.red;
    uniforms.u_green.value = params.green;
    uniforms.u_blue.value = params.blue;
    uniforms.u_noiseScale.value = params.noiseScale;
    uniforms.u_displacementScale.value = params.displacementScale;

    // update particle colors
    updateParticleColors();

    // update bloom
    bloomPass.threshold = params.threshold;
    bloomPass.strength = params.strength;
    bloomPass.radius = params.radius;

    // reset volume
    sound.setVolume(params.volume);

    // update gui
    gui.updateDisplay();
}

// gui for params
const gui = new GUI();
// color
const colorFolder = gui.addFolder("Colors");
colorFolder.add(params, "red", 0.0, 1.0).onChange((value) => {
    uniforms.u_red.value = value;
    updateParticleColors();
});
colorFolder.add(params, "green", 0.0, 1.0).onChange((value) => {
    uniforms.u_green.value = value;
    updateParticleColors();
});
colorFolder.add(params, "blue", 0.0, 1.0).onChange((value) => {
    uniforms.u_blue.value = value;
    updateParticleColors();
});
// bloom
const bloomFolder = gui.addFolder("Bloom");
bloomFolder.add(params, "threshold", 0.0, 1.0).onChange((value) => (bloomPass.threshold = value));
bloomFolder.add(params, "strength", 0.0, 3.0).onChange((value) => (bloomPass.strength = value));
bloomFolder.add(params, "radius", 0.0, 1.0).onChange((value) => (bloomPass.radius = value));
// noise
const noiseFolder = gui.addFolder("Noise");
noiseFolder.add(params, "noiseScale", 0.1, 10.0).onChange((value) => (uniforms.u_noiseScale.value = value));
noiseFolder.add(params, "displacementScale", 0.1, 10.0).onChange((value) => (uniforms.u_displacementScale.value = value));
// audio
const audioFolder = gui.addFolder("Audio");
audioFolder.add(params, "fileName").name("File Name").listen(); // Display current file name (non-editable)
audioFolder
    .add(params, "volume", 0, 1, 0.01)
    .name("Volume")
    .onChange((value) => {
        sound.setVolume(value); // Update volume dynamically
    });

// upload audio file
const audioUpload = {
    uploadAudio: () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "audio/*";
        input.style.display = "none";

        input.addEventListener("change", (event) => {
            const file = event.target.files[0];
            if (file) {
                loadAudioFile(file);
            }
        });

        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
    },
};
audioFolder.add(audioUpload, "uploadAudio").name("Upload Audio");
// reset button
gui.add({ reset: resetParameters }, 'reset').name("Reset All");

// animations
const clock = new THREE.Clock(); // time since program start
function animate() {
    const elapsedTime = clock.getElapsedTime();
    uniforms.u_time.value = elapsedTime; // time passed to shader

    if (analyser) {
        const frequencyData = analyser.getFrequencyData(); // fetch frequency data
        currentFrequency = frequencyData.reduce((sum, value) => sum + value, 0) / frequencyData.length; // calculates average of all frequency bands
        uniforms.u_frequency.value = currentFrequency;

        particleSystem.scale.setScalar(1 + currentFrequency / 500); // particle system scaled based on frequency (pulsing behavior)
    }

    // object rotations
    sphere.rotation.y += 0.005;
    noiseSphere.rotation.y += 0.005;
    noiseSphere.rotation.x += 0.005;
    particleSystem.rotation.y += 0.0005;

    // camera zoom out and in with frequency
    const zoomFactor = 1 + currentFrequency / 500;
    camera.position.x = 30 * zoomFactor * Math.cos(elapsedTime * 0.0001);
    camera.position.z = 30 * zoomFactor * Math.sin(elapsedTime * 0.0001);
    camera.lookAt(scene.position);

    composer.render();
    requestAnimationFrame(animate);
}
animate();

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// Initial Default Audio Load
loadDefaultAudio();