import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

type Props = {
  clinicName: string
  inviteUrl: string
}

export function InviteEmail({ clinicName, inviteUrl }: Props) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>Convite para gerenciar {clinicName} no KPI Clinic OS</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>KPI Clinic OS</Heading>
          <Text style={text}>Olá!</Text>
          <Text style={text}>
            Você foi convidado para gerenciar <strong>{clinicName}</strong> no KPI Clinic OS.
          </Text>
          <Section style={{ textAlign: 'center' as const, marginTop: 24 }}>
            <Button href={inviteUrl} style={button}>
              Criar minha conta
            </Button>
          </Section>
          <Text style={muted}>O link é válido por 7 dias.</Text>
          <Hr style={hr} />
          <Text style={muted}>Se o botão não funcionar, copie e cole o link no navegador:</Text>
          <Text style={link}>{inviteUrl}</Text>
        </Container>
      </Body>
    </Html>
  )
}

const body = { backgroundColor: '#f6f9fc', fontFamily: 'system-ui, -apple-system, sans-serif' }
const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '32px 24px',
  maxWidth: 560,
  borderRadius: 8,
}
const heading = { color: '#6366f1', fontSize: 20, fontWeight: 700, margin: 0 }
const text = { color: '#111827', fontSize: 14, lineHeight: '22px' }
const muted = { color: '#6b7280', fontSize: 12, lineHeight: '18px' }
const link = { color: '#6366f1', fontSize: 12, wordBreak: 'break-all' as const }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const button = {
  backgroundColor: '#6366f1',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: 6,
  textDecoration: 'none',
  fontSize: 14,
  fontWeight: 600,
}
