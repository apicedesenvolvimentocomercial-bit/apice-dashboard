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
  userName: string
  resetUrl: string
}

export function ResetPasswordEmail({ userName, resetUrl }: Props) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>Recuperação de senha — KPI Clinic OS</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>KPI Clinic OS</Heading>
          <Text style={text}>Olá, {userName}!</Text>
          <Text style={text}>Recebemos uma solicitação para redefinir a senha da sua conta.</Text>
          <Section style={{ textAlign: 'center' as const, marginTop: 24 }}>
            <Button href={resetUrl} style={button}>
              Redefinir senha
            </Button>
          </Section>
          <Text style={muted}>O link é válido por 1 hora e só pode ser usado uma vez.</Text>
          <Hr style={hr} />
          <Text style={muted}>
            Se você não solicitou isso, ignore este email. Sua senha não será alterada.
          </Text>
          <Text style={link}>{resetUrl}</Text>
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
