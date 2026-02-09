// =====================================================
// SPATIAL AUDIO PLAYER PRO - COMPLETE IMPLEMENTATION
// =====================================================

// Audio Context and Nodes
let audioContext;
let audioElement;
let audioSource;
let analyser;
let gainNode;
let pannerNode;
let convolverNode;
let bassBoostFilter;
let eqFilters = {};

// State
let playlist = [];
let currentTrackIndex = 0;
let isPlaying = false;
let isShuffle = false;
let repeatMode = 'off'; // off, one, all
let panningAnimation = null;
let panAngle = 0;
let visualizerMode = 'bars';
let currentTheme = 'blue';
let performanceMode = false;
let isMuted = false;
let previousVolume = 70;

// Tutorial
let tutorialStep = 1;
let tutorialCompleted = localStorage.getItem('tutorialCompleted') === 'true';

// FPS Tracking
let fps = 0;
let lastFrameTime = performance.now();
let frameCount = 0;

// Beat Detection
let beatThreshold = 0;
let beatDecay = 0;
let beatTime = 0;

// Waveform Data
let waveformData = [];

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    initCustomCursor();
    initTutorial();
    initTheme();
    initEventListeners();
    console.log('🎵 Spatial Audio Player Pro Loaded!');
});

// =====================================================
// CUSTOM CURSOR
// =====================================================

function initCustomCursor() {
    const cursorDot = document.querySelector('.cursor-dot');
    const cursorTrail = document.querySelector('.cursor-trail');
    
    if (window.innerWidth < 768) return; // Disable on mobile
    
    document.addEventListener('mousemove', (e) => {
        cursorDot.style.left = e.clientX + 'px';
        cursorDot.style.top = e.clientY + 'px';
        
        setTimeout(() => {
            cursorTrail.style.left = e.clientX + 'px';
            cursorTrail.style.top = e.clientY + 'px';
        }, 50);
    });
    
    // Add hover effect for interactive elements
    const interactiveElements = document.querySelectorAll('button, a, input[type="range"], .upload-area, .playlist-item, .preset-card');
    
    interactiveElements.forEach(el => {
        el.addEventListener('mouseenter', () => document.body.classList.add('hovering'));
        el.addEventListener('mouseleave', () => document.body.classList.remove('hovering'));
    });
}

// =====================================================
// TUTORIAL
// =====================================================

function initTutorial() {
    if (tutorialCompleted) {
        document.getElementById('tutorialOverlay').style.display = 'none';
        return;
    }
    
    document.getElementById('nextTutorial').addEventListener('click', () => {
        if (tutorialStep < 3) {
            tutorialStep++;
            updateTutorial();
        } else {
            completeTutorial();
        }
    });
    
    document.getElementById('skipTutorial').addEventListener('click', completeTutorial);
    
    document.querySelectorAll('.dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
            tutorialStep = parseInt(e.target.dataset.step);
            updateTutorial();
        });
    });
}

function updateTutorial() {
    document.querySelectorAll('.tutorial-step').forEach(step => {
        step.classList.toggle('active', parseInt(step.dataset.step) === tutorialStep);
    });
    
    document.querySelectorAll('.dot').forEach(dot => {
        dot.classList.toggle('active', parseInt(dot.dataset.step) === tutorialStep);
    });
    
    document.getElementById('nextTutorial').textContent = tutorialStep === 3 ? 'Get Started' : 'Next';
}

function completeTutorial() {
    document.getElementById('tutorialOverlay').style.display = 'none';
    localStorage.setItem('tutorialCompleted', 'true');
    tutorialCompleted = true;
}

// =====================================================
// THEME MANAGEMENT
// =====================================================

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'blue';
    applyTheme(savedTheme);
}

function applyTheme(theme) {
    currentTheme = theme;
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    document.querySelectorAll('.theme-option').forEach(option => {
        option.classList.toggle('active', option.dataset.theme === theme);
    });
}

// =====================================================
// AUDIO CONTEXT INITIALIZATION
// =====================================================

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.8;
        
        gainNode = audioContext.createGain();
        gainNode.gain.value = 0.7;
        
        pannerNode = audioContext.createStereoPanner();
        
        convolverNode = audioContext.createConvolver();
        createReverbImpulse();
        
        bassBoostFilter = audioContext.createBiquadFilter();
        bassBoostFilter.type = 'lowshelf';
        bassBoostFilter.frequency.value = 200;
        bassBoostFilter.gain.value = 0;
        
        const frequencies = [60, 250, 1000, 4000, 16000];
        frequencies.forEach((freq, index) => {
            const filter = audioContext.createBiquadFilter();
            filter.type = index === 0 ? 'lowshelf' : index === frequencies.length - 1 ? 'highshelf' : 'peaking';
            filter.frequency.value = freq;
            filter.gain.value = 0;
            filter.Q.value = 1;
            eqFilters[freq] = filter;
        });
    }
}

function createReverbImpulse() {
    const sampleRate = audioContext.sampleRate;
    const length = sampleRate * 2.5;
    const impulse = audioContext.createBuffer(2, length, sampleRate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);
    
    for (let i = 0; i < length; i++) {
        const decay = Math.exp(-i / (sampleRate * 0.6));
        impulseL[i] = (Math.random() * 2 - 1) * decay;
        impulseR[i] = (Math.random() * 2 - 1) * decay;
    }
    
    convolverNode.buffer = impulse;
}

function setupAudioChain() {
    if (audioSource) {
        audioSource.disconnect();
    }
    
    audioSource = audioContext.createMediaElementSource(audioElement);
    
    let currentNode = audioSource;
    
    Object.values(eqFilters).forEach(filter => {
        currentNode.connect(filter);
        currentNode = filter;
    });
    
    currentNode.connect(bassBoostFilter);
    currentNode = bassBoostFilter;
    
    currentNode.connect(pannerNode);
    currentNode = pannerNode;
    
    const dryGain = audioContext.createGain();
    const wetGain = audioContext.createGain();
    dryGain.gain.value = 1;
    wetGain.gain.value = 0;
    
    currentNode.connect(dryGain);
    currentNode.connect(convolverNode);
    convolverNode.connect(wetGain);
    
    dryGain.connect(gainNode);
    wetGain.connect(gainNode);
    gainNode.connect(analyser);
    analyser.connect(audioContext.destination);
    
    audioContext.wetGain = wetGain;
}

// =====================================================
// FILE HANDLING & PLAYLIST
// =====================================================

function handleFileUpload(files) {
    Array.from(files).forEach(file => {
        if (file.type.startsWith('audio/')) {
            playlist.push({
                file: file,
                url: URL.createObjectURL(file),
                title: file.name.replace(/\.[^/.]+$/, ''),
                duration: 0,
                albumArt: null
            });
        }
    });
    
    if (playlist.length > 0) {
        updatePlaylist();
        if (!audioElement) {
            loadTrack(0);
        }
        document.getElementById('playlistSection').style.display = 'block';
    }
}

function updatePlaylist() {
    const container = document.getElementById('playlistItems');
    container.innerHTML = '';
    
    playlist.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item' + (index === currentTrackIndex ? ' active' : '');
        item.innerHTML = `
            <div class="playlist-item-index">${index + 1}</div>
            <div class="playlist-item-info">
                <div class="playlist-item-title">${track.title}</div>
                <div class="playlist-item-duration">${track.duration > 0 ? formatTime(track.duration) : '--:--'}</div>
            </div>
            <button class="playlist-item-remove">✕</button>
        `;
        
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('playlist-item-remove')) {
                loadTrack(index);
            }
        });
        
        item.querySelector('.playlist-item-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            removeTrack(index);
        });
        
        container.appendChild(item);
    });
}

function loadTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    
    currentTrackIndex = index;
    const track = playlist[index];
    
    initAudioContext();
    
    if (audioElement) {
        audioElement.pause();
        URL.revokeObjectURL(audioElement.src);
    }
    
    audioElement = new Audio();
    audioElement.src = track.url;
    
    audioElement.addEventListener('loadedmetadata', () => {
        track.duration = audioElement.duration;
        document.getElementById('duration').textContent = formatTime(audioElement.duration);
        document.getElementById('songTitle').textContent = track.title;
        document.getElementById('songArtist').textContent = 'Unknown Artist';
        
        updateSongStats();
        extractAlbumArt(track.file);
        generateWaveform();
        
        setupAudioChain();
        updatePlaylist();
        showPlayer();
        
        if (isPlaying) {
            audioElement.play();
        }
    });
    
    audioElement.addEventListener('timeupdate', updateProgress);
    audioElement.addEventListener('ended', handleTrackEnd);
    
    updateMiniPlayer();
}

function removeTrack(index) {
    if (playlist[index]) {
        URL.revokeObjectURL(playlist[index].url);
        playlist.splice(index, 1);
        
        if (index === currentTrackIndex && playlist.length > 0) {
            loadTrack(Math.min(index, playlist.length - 1));
        } else if (index < currentTrackIndex) {
            currentTrackIndex--;
        }
        
        updatePlaylist();
        
        if (playlist.length === 0) {
            resetPlayer();
        }
    }
}

function handleTrackEnd() {
    if (repeatMode === 'one') {
        audioElement.currentTime = 0;
        audioElement.play();
    } else {
        nextTrack();
    }
}

function nextTrack() {
    if (playlist.length === 0) return;
    
    let nextIndex;
    if (isShuffle) {
        nextIndex = Math.floor(Math.random() * playlist.length);
    } else {
        nextIndex = currentTrackIndex + 1;
        if (nextIndex >= playlist.length) {
            nextIndex = repeatMode === 'all' ? 0 : currentTrackIndex;
        }
    }
    
    if (nextIndex !== currentTrackIndex || repeatMode === 'all') {
        loadTrack(nextIndex);
        if (isPlaying) {
            setTimeout(() => audioElement.play(), 100);
        }
    } else {
        isPlaying = false;
        updatePlayPauseButton();
    }
}

function previousTrack() {
    if (playlist.length === 0) return;
    
    if (audioElement && audioElement.currentTime > 3) {
        audioElement.currentTime = 0;
    } else {
        const prevIndex = currentTrackIndex - 1;
        if (prevIndex >= 0) {
            loadTrack(prevIndex);
            if (isPlaying) {
                setTimeout(() => audioElement.play(), 100);
            }
        }
    }
}

function showPlayer() {
    document.getElementById('uploadSection').style.marginBottom = '0';
    document.getElementById('playerSection').style.display = 'block';
    document.getElementById('effectsSection').style.display = 'block';
    document.getElementById('presetsSection').style.display = 'block';
    document.getElementById('advancedControls').style.display = 'block';
    document.getElementById('exportSection').style.display = 'block';
    startVisualizer();
}

function resetPlayer() {
    if (audioElement) {
        audioElement.pause();
        audioElement = null;
    }
    
    playlist = [];
    currentTrackIndex = 0;
    isPlaying = false;
    
    document.getElementById('playlistSection').style.display = 'none';
    document.getElementById('playerSection').style.display = 'none';
    document.getElementById('effectsSection').style.display = 'none';
    document.getElementById('presetsSection').style.display = 'none';
    document.getElementById('advancedControls').style.display = 'none';
    document.getElementById('exportSection').style.display = 'none';
    document.getElementById('miniPlayer').style.display = 'none';
    
    if (panningAnimation) {
        cancelAnimationFrame(panningAnimation);
        panningAnimation = null;
    }
}

// =====================================================
// ALBUM ART & COLORS
// =====================================================

function extractAlbumArt(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const arrayBuffer = e.target.result;
            const uint8Array = new Uint8Array(arrayBuffer);
            
            // Simple ID3v2 tag parsing for album art
            const tagHeader = String.fromCharCode(...uint8Array.slice(0, 3));
            
            if (tagHeader === 'ID3') {
                const tagSize = ((uint8Array[6] & 0x7f) << 21) |
                              ((uint8Array[7] & 0x7f) << 14) |
                              ((uint8Array[8] & 0x7f) << 7) |
                              (uint8Array[9] & 0x7f);
                
                // Look for APIC frame (album art)
                let pos = 10;
                while (pos < tagSize) {
                    const frameId = String.fromCharCode(...uint8Array.slice(pos, pos + 4));
                    const frameSize = (uint8Array[pos + 4] << 24) |
                                     (uint8Array[pos + 5] << 16) |
                                     (uint8Array[pos + 6] << 8) |
                                     uint8Array[pos + 7];
                    
                    if (frameId === 'APIC') {
                        // Found album art
                        const frameData = uint8Array.slice(pos + 10, pos + 10 + frameSize);
                        
                        // Find image data (skip text encoding and description)
                        let imageStart = 0;
                        for (let i = 1; i < frameData.length; i++) {
                            if (frameData[i] === 0xFF && frameData[i + 1] === 0xD8) {
                                // JPEG marker
                                imageStart = i;
                                break;
                            } else if (frameData[i] === 0x89 && frameData[i + 1] === 0x50) {
                                // PNG marker
                                imageStart = i;
                                break;
                            }
                        }
                        
                        if (imageStart > 0) {
                            const imageData = frameData.slice(imageStart);
                            const blob = new Blob([imageData]);
                            const imageUrl = URL.createObjectURL(blob);
                            displayAlbumArt(imageUrl);
                            return;
                        }
                    }
                    
                    pos += 10 + frameSize;
                }
            }
        } catch (err) {
            console.log('Could not extract album art');
        }
        
        // Use placeholder
        displayAlbumArt(null);
    };
    
    reader.readAsArrayBuffer(file.slice(0, 1024 * 1024)); // Read first 1MB
}

function displayAlbumArt(url) {
    const albumArt = document.getElementById('albumArt');
    const placeholder = document.querySelector('.album-art-placeholder');
    const vinyl = document.getElementById('vinylRecord');
    const albumBlurBg = document.getElementById('albumBlurBg');
    const miniAlbumArt = document.getElementById('miniAlbumArt');
    
    if (url) {
        albumArt.src = url;
        albumArt.classList.add('loaded');
        placeholder.style.display = 'none';
        
        // Apply blur background
        albumBlurBg.style.backgroundImage = `url(${url})`;
        albumBlurBg.classList.add('active');
        
        // Extract dominant colors
        extractColors(url);
        
        // Update mini player
        miniAlbumArt.src = url;
    } else {
        albumArt.classList.remove('loaded');
        placeholder.style.display = 'flex';
        albumBlurBg.classList.remove('active');
    }
    
    // Show vinyl for aesthetics
    vinyl.style.opacity = '0.2';
}

function extractColors(imageUrl) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        let r = 0, g = 0, b = 0;
        let count = 0;
        
        // Sample colors
        for (let i = 0; i < data.length; i += 4 * 10) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
        }
        
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        
        // Apply subtle color tint to UI
        const bgGradient = document.getElementById('bgGradient');
        bgGradient.style.background = `
            linear-gradient(135deg, 
                rgb(${r * 0.1}, ${g * 0.1}, ${b * 0.1}) 0%, 
                #0a0a1a 50%, 
                rgb(${r * 0.05}, ${g * 0.05}, ${b * 0.05}) 100%)
        `;
    };
    img.src = imageUrl;
}

// =====================================================
// WAVEFORM GENERATION
// =====================================================

async function generateWaveform() {
    if (!audioElement) return;
    
    try {
        const response = await fetch(audioElement.src);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const rawData = audioBuffer.getChannelData(0);
        const samples = 200;
        const blockSize = Math.floor(rawData.length / samples);
        const filteredData = [];
        
        for (let i = 0; i < samples; i++) {
            let blockStart = blockSize * i;
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
                sum += Math.abs(rawData[blockStart + j]);
            }
            filteredData.push(sum / blockSize);
        }
        
        waveformData = filteredData;
        drawWaveform();
    } catch (err) {
        console.log('Could not generate waveform:', err);
    }
}

function drawWaveform() {
    const canvas = document.getElementById('waveformCanvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    const width = canvas.width;
    const height = canvas.height;
    const barWidth = width / waveformData.length;
    
    ctx.clearRect(0, 0, width, height);
    
    waveform
