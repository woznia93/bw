'use client'

import { useEffect, useRef, useState } from 'react'

interface Position {
  x: number
  y: number
}

interface Velocity {
  x: number
  y: number
}

interface AttackBox {
  position: Position
  offset: Position
  width: number
  height: number
}

class Sprite {
  position: Position
  image: HTMLImageElement

  constructor({ position, imageSrc }: { position: Position; imageSrc: string }) {
    this.position = position
    this.image = new Image()
    this.image.src = imageSrc
  }

  draw(c: CanvasRenderingContext2D) {
    c.drawImage(this.image, this.position.x, this.position.y)
  }
}

class Fighter {
  position: Position
  velocity: Velocity
  width: number
  height: number
  lastKeyx: string | null = null
  lastKeyy: string | null = null
  attackBox: AttackBox
  color: string
  isAttacking: boolean = false
  health: number
  gravity: number

  constructor({
    position,
    velocity,
    color = 'red',
    offset,
    gravity,
  }: {
    position: Position
    velocity: Velocity
    color?: string
    offset: Position
    gravity: number
  }) {
    this.position = position
    this.velocity = velocity
    this.width = 50
    this.height = 150
    this.attackBox = {
      position: {
        x: this.position.x,
        y: this.position.y,
      },
      offset,
      width: 100,
      height: 50,
    }
    this.color = color
    this.health = 100
    this.gravity = gravity
  }

  draw(c: CanvasRenderingContext2D, canvasHeight: number) {
    c.fillStyle = this.color
    c.fillRect(this.position.x, this.position.y, this.width, this.height)

    if (this.isAttacking) {
      c.fillStyle = 'white'
      c.fillRect(
        this.attackBox.position.x,
        this.attackBox.position.y,
        this.attackBox.width,
        this.attackBox.height
      )
    }
  }

  update(c: CanvasRenderingContext2D, canvasHeight: number) {
    this.draw(c, canvasHeight)
    this.attackBox.position.x = this.position.x + this.attackBox.offset.x
    this.attackBox.position.y = this.position.y

    this.position.x += this.velocity.x
    this.position.y += this.velocity.y

    if (this.position.y + this.height + this.velocity.y >= canvasHeight) {
      this.velocity.y = 0
    } else {
      this.velocity.y += this.gravity
    }
  }

  attack() {
    this.isAttacking = true
    setTimeout(() => {
      this.isAttacking = false
    }, 100)
  }
}

export function FightingGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playerHealth, setPlayerHealth] = useState(100)
  const [enemyHealth, setEnemyHealth] = useState(100)
  const [timer, setTimer] = useState(10)
  const [winner, setWinner] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = 1024
    canvas.height = 576

    const gravity = 0.7
    let gameTimer = 10
    let timerIntervalId: ReturnType<typeof setInterval> | null = null
    let animationFrameId: number | null = null

    const background = new Sprite({
      position: { x: 0, y: 0 },
      imageSrc: '/hillsbackground.png',
    })

    const player = new Fighter({
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      offset: { x: 0, y: 0 },
      gravity,
    })

    const enemy = new Fighter({
      position: { x: 500, y: 100 },
      velocity: { x: 0, y: 0 },
      color: 'blue',
      offset: { x: -50, y: 0 },
      gravity,
    })

    const keys: Record<string, { pressed: boolean }> = {
      a: { pressed: false },
      d: { pressed: false },
      w: { pressed: false },
      s: { pressed: false },
      ArrowRight: { pressed: false },
      ArrowLeft: { pressed: false },
      ArrowUp: { pressed: false },
      ArrowDown: { pressed: false },
    }

    function rectangularCollision({
      rectangle1,
      rectangle2,
    }: {
      rectangle1: Fighter
      rectangle2: Fighter
    }) {
      return (
        rectangle1.attackBox.position.x + rectangle1.attackBox.width >=
          rectangle2.position.x &&
        rectangle1.attackBox.position.x <=
          rectangle2.position.x + rectangle2.width &&
        rectangle1.attackBox.position.y + rectangle1.attackBox.height >=
          rectangle2.position.y &&
        rectangle1.attackBox.position.y <=
          rectangle2.position.y + rectangle2.height
      )
    }

    function determineWinner() {
      if (timerIntervalId) clearInterval(timerIntervalId)
      if (animationFrameId) cancelAnimationFrame(animationFrameId)

      if (player.health === enemy.health) {
        setWinner('Tie')
      } else if (player.health > enemy.health) {
        setWinner('Player 1 Wins')
      } else {
        setWinner('Player 2 Wins')
      }
    }

    function animate() {
      animationFrameId = requestAnimationFrame(animate)
      if (!ctx || !canvas) return

      // Draw background
      ctx.fillStyle = 'black'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      background.draw(ctx)

      player.update(ctx, canvas.height)
      enemy.update(ctx, canvas.height)

      player.velocity.x = 0
      enemy.velocity.x = 0

      // Player Movement
      if (keys.a.pressed && player.lastKeyx === 'a') {
        player.velocity.x = -5
      } else if (keys.d.pressed && player.lastKeyx === 'd') {
        player.velocity.x = 5
      }

      // Enemy Movement
      if (keys.ArrowLeft.pressed && enemy.lastKeyx === 'ArrowLeft') {
        enemy.velocity.x = -5
      } else if (keys.ArrowRight.pressed && enemy.lastKeyx === 'ArrowRight') {
        enemy.velocity.x = 5
      }

      // Collision Detection - Player on Enemy
      if (
        rectangularCollision({
          rectangle1: player,
          rectangle2: enemy,
        }) &&
        player.isAttacking
      ) {
        player.isAttacking = false
        enemy.health -= 20
        setEnemyHealth(enemy.health)
      }

      // Collision Detection - Enemy on Player
      if (
        rectangularCollision({
          rectangle1: enemy,
          rectangle2: player,
        }) &&
        enemy.isAttacking
      ) {
        enemy.isAttacking = false
        player.health -= 20
        setPlayerHealth(player.health)
      }

      // End game based on health
      if (enemy.health <= 0 || player.health <= 0) {
        determineWinner()
      }
    }

    function decreaseTimer() {
      if (gameTimer > 0) {
        gameTimer--
        setTimer(gameTimer)
        timerIntervalId = setInterval(() => {
          gameTimer--
          setTimer(gameTimer)
          if (gameTimer === 0) {
            determineWinner()
          }
        }, 1000)
      } else {
        determineWinner()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key in keys) {
        keys[key].pressed = true
      }

      switch (event.key) {
        case 'a':
          player.lastKeyx = 'a'
          break
        case 'd':
          player.lastKeyx = 'd'
          break
        case 'w':
          player.velocity.y = -15
          break
        case 's':
          player.velocity.y = 5
          break
        case ' ':
          player.attack()
          break
        case 'ArrowRight':
          enemy.lastKeyx = 'ArrowRight'
          break
        case 'ArrowLeft':
          enemy.lastKeyx = 'ArrowLeft'
          break
        case 'ArrowUp':
          enemy.velocity.y = -15
          break
        case 'ArrowDown':
          enemy.velocity.y = 5
          break
        case 'Shift':
          enemy.attack()
          break
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key in keys) {
        keys[key].pressed = false
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    decreaseTimer()
    animate()

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      if (animationFrameId) cancelAnimationFrame(animationFrameId)
      if (timerIntervalId) clearInterval(timerIntervalId)
    }
  }, [])

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {/* HUD */}
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            padding: '20px',
            zIndex: 10,
          }}
        >
          {/* Player Health */}
          <div style={{ position: 'relative', height: '30px', width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
            <div
              style={{
                backgroundColor: 'rgb(250, 121, 143)',
                height: '30px',
                width: '100%',
              }}
            />
            <div
              style={{
                position: 'absolute',
                backgroundColor: 'aqua',
                top: 0,
                right: 0,
                bottom: 0,
                width: `${playerHealth}%`,
                transition: 'width 0.1s',
              }}
            />
          </div>

          {/* Timer */}
          <div
            style={{
              backgroundColor: 'maroon',
              width: '100px',
              height: '100px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '24px',
              fontWeight: 'bold',
            }}
          >
            {timer}
          </div>

          {/* Enemy Health */}
          <div style={{ position: 'relative', height: '30px', width: '100%' }}>
            <div
              style={{
                backgroundColor: 'rgb(250, 121, 143)',
                height: '30px',
              }}
            />
            <div
              style={{
                position: 'absolute',
                backgroundColor: 'aqua',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                width: `${enemyHealth}%`,
                transition: 'width 0.1s',
              }}
            />
          </div>
        </div>

        {/* Winner Display */}
        {winner && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              fontSize: '48px',
              fontWeight: 'bold',
              zIndex: 20,
            }}
          >
            {winner}
          </div>
        )}

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          style={{ border: '2px solid white', display: 'block', maxWidth: '100%' }}
        />
      </div>

      {/* Controls */}
      <div className="text-sm text-neutral-600 dark:text-neutral-400 text-center max-w-lg">
        <p className="font-semibold mb-2">🎮 Player 1 (Red): A/D to move, W to jump, Space to attack</p>
        <p className="font-semibold">🎮 Player 2 (Blue): Arrow Keys to move, ↑ to jump, Shift to attack</p>
      </div>
    </div>
  )
}
