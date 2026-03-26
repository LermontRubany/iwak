import { useState, useRef, useEffect, useCallback } from 'react';

const TRACKS = [
  { src: '/audio/BATO - OD Member prod. Khanafi.mp3', label: 'Chill' },
  { src: '/audio/Taman Shud - The Black Queen.m4a', label: 'Deep' },
  { src: '/audio/Dependence (Original Mix) - Taras Bazeev.m4a', label: 'Ambient' },
];

export default function MiniPlayer() {
  const [currentTrack, setCurrentTrack] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef(null);
  const rafRef = useRef(null);

  const updateProgress = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.duration) {
      setProgress(audio.currentTime / audio.duration);
    }
    rafRef.current = requestAnimationFrame(updateProgress);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = 1;
    audio.src = TRACKS[0].src;
    audio.load();

    const handleEnded = () => {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    };

    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('ended', handleEnded);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.src = TRACKS[currentTrack].src;
    audio.load();
    setProgress(0);

    if (isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    }
  }, [currentTrack]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      cancelAnimationFrame(rafRef.current);
      setIsPlaying(false);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
        rafRef.current = requestAnimationFrame(updateProgress);
      }).catch(() => {});
    }
  };

  const switchTrack = (index) => {
    if (index === currentTrack) return;
    const audio = audioRef.current;
    if (audio) audio.pause();
    cancelAnimationFrame(rafRef.current);
    setCurrentTrack(index);
  };

  const seekTo = (e) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    audio.currentTime = x * audio.duration;
    setProgress(x);
  };

  return (
    <div className="mini-player">
      <audio ref={audioRef} preload="auto" />

      <p className="mini-player__subtitle">Скидки скоро появятся</p>
      <p className="mini-player__hint">А пока — включи музыку</p>

      <div className={`mini-player__eq${isPlaying ? ' mini-player__eq--active' : ''}`}>
        <span /><span /><span /><span /><span />
      </div>

      <div className="mini-player__controls">
        <button
          className={`mini-player__play${isPlaying ? ' mini-player__play--active' : ''}`}
          onClick={togglePlay}
          aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2" width="4" height="12" rx="1" />
              <rect x="9" y="2" width="4" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <polygon points="4,2 14,8 4,14" />
            </svg>
          )}
        </button>

        <div className="mini-player__progress" onClick={seekTo}>
          <div
            className="mini-player__progress-fill"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <div className="mini-player__tracks">
        {TRACKS.map((track, i) => (
          <button
            key={track.label}
            className={`mini-player__dot${i === currentTrack ? ' mini-player__dot--active' : ''}`}
            onClick={() => switchTrack(i)}
            aria-label={track.label}
            title={track.label}
          />
        ))}
      </div>
    </div>
  );
}
