import { ExternalLink } from 'lucide-react'
import { useDevice } from '../../store/device'
import { send } from '../../store/hooks'
import { Card, Row, Slider } from '../../components/ui'
import { HostForm, HostedNotice } from './HostForm'
import { httpBase } from '../../api/config'

function uptime(sec: number) {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(' ')
}

export function SettingsPanel() {
  const info = useDevice((s) => s.info)
  const state = useDevice((s) => s.state)
  const host = useDevice((s) => s.host)
  const status = useDevice((s) => s.status)
  const transport = useDevice((s) => s.transport)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="grid min-w-0 grid-cols-1 content-start gap-4">
        <Card title="Connection">
          <HostForm />
          <div className="mt-4">
            <HostedNotice />
          </div>
          <div className="mt-4">
            <Row label="Status">{status === 'online' ? `Online via ${transport === 'websocket' ? 'WebSocket' : 'HTTP polling'}` : status}</Row>
            {info && <Row label="WebSocket clients">{info.ws < 0 ? 'not supported by firmware' : info.ws}</Row>}
          </div>
        </Card>

        {state && (
          <Card title="Behaviour">
            <Slider
              label="Transition time"
              min={0}
              max={50}
              value={state.transition}
              onChange={(transition) => send({ transition })}
              format={(v) => `${(v / 10).toFixed(1)} s`}
            />
            <p className="mt-1 text-xs text-muted">Fade duration between colours and brightness levels. Resets to the lamp's saved default on reboot.</p>
          </Card>
        )}

        <Card title="Advanced">
          <p className="mb-3 text-sm text-muted">
            Wi-Fi, LED hardware, sound input and sync are configured in the lamp's built-in settings pages.
          </p>
          <a href={host ? `${httpBase(host)}/settings` : undefined} target="_blank" rel="noreferrer" className="accent-text inline-flex items-center gap-1.5 text-sm hover:underline">
            Open WLED settings <ExternalLink className="size-3.5" />
          </a>
        </Card>
      </div>

      {info && (
        <Card title="Device">
          <Row label="Name">{info.name}</Row>
          <Row label="Firmware">
            {info.ver}
            {info.rel ? ` (${info.rel})` : ''} · build {info.vid}
          </Row>
          <Row label="Hardware">{info.e32model ? `${info.e32model}, ${info.e32cores} cores @ ${info.e32speed} MHz` : info.arch}</Row>
          <Row label="LEDs">
            {info.leds.count}
            {info.leds.somp ? ` · ${info.leds.somp === 1 ? '2D matrix' : '3D'}` : ''}
            {info.leds.rgbw ? ' · RGBW' : ''}
            {info.leds.fps ? ` · ${info.leds.fps} fps` : ''}
          </Row>
          {info.leds.maxpwr > 0 && (
            <Row label="Power draw">
              {info.leds.pwr} mA / {info.leds.maxpwr} mA limit
            </Row>
          )}
          <Row label="Effects / palettes">
            {info.fxcount} / {info.palcount}
          </Row>
          {info.audioType && (
            <Row label="Sound input">
              {info.audioType}
              {info.audioStatus ? ` · ${info.audioStatus}` : ''}
              {info.audioGain ? ` · gain ${info.audioGain}x` : ''}
            </Row>
          )}
          {info.audioWarning && <Row label="Sound warning">{info.audioWarning}</Row>}
          <Row label="Wi-Fi signal">{info.ip ? `${info.wifi.signal}% (${info.wifi.rssi} dBm, ch ${info.wifi.channel})` : 'Access-point mode'}</Row>
          <Row label="IP (station)">{info.ip || '—'}</Row>
          <Row label="MAC">{info.mac}</Row>
          <Row label="Uptime">{uptime(info.uptime)}</Row>
          <Row label="Free memory">
            {Math.round(info.freeheap / 1024)} kB
            {info.totalheap ? ` of ${Math.round(info.totalheap / 1024)} kB` : ''}
          </Row>
          <Row label="Storage">
            {info.fs.u} kB / {info.fs.t} kB
          </Row>
        </Card>
      )}
    </div>
  )
}
