interface ReelProps {
  spinning: boolean
  side: 'left' | 'right'
}

/** テープのリール。再生中だけ回転する（SVGのスポーク付きハブ）。 */
export function Reel({ spinning, side }: ReelProps) {
  return (
    <div className={`reel reel-${side}`}>
      <svg viewBox="0 0 100 100" className={`reel-svg ${spinning ? 'spin' : ''}`}>
        {/* テープの巻き（外周の濃い輪） */}
        <circle cx="50" cy="50" r="46" className="reel-tape" />
        <circle cx="50" cy="50" r="44" className="reel-tape-edge" />
        {/* ハブ本体 */}
        <circle cx="50" cy="50" r="24" className="reel-hub" />
        {/* スポーク（3本） */}
        {[0, 120, 240].map((deg) => (
          <rect
            key={deg}
            x="47"
            y="14"
            width="6"
            height="22"
            rx="3"
            className="reel-spoke"
            transform={`rotate(${deg} 50 50)`}
          />
        ))}
        {/* 中心の穴 */}
        <circle cx="50" cy="50" r="8" className="reel-center" />
      </svg>
    </div>
  )
}
