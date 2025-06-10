import React from 'react';

const footerStyle: React.CSSProperties = {
  backgroundColor: '#f8f9fa',
  padding: '20px 40px',
  borderTop: '1px solid #e7e7e7',
  textAlign: 'center',
  marginTop: '40px',
};

const linkStyle: React.CSSProperties = {
  color: '#007bff',
  textDecoration: 'none',
  margin: '0 15px',
  fontSize: '14px',
};

const Footer: React.FC = () => {
  const privacyPolicyUrl = process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL;
  const cookiePolicyUrl = process.env.NEXT_PUBLIC_COOKIE_POLICY_URL;
  const termsUrl = process.env.NEXT_PUBLIC_TERMS_URL;
  const stateAidUrl = process.env.NEXT_PUBLIC_STATE_AID_URL;

  return (
    <footer style={footerStyle}>
      {privacyPolicyUrl && <a href={privacyPolicyUrl} style={linkStyle} target="_blank" rel="noopener noreferrer">Privacy Policy</a>}
      {cookiePolicyUrl && <a href={cookiePolicyUrl} style={linkStyle} target="_blank" rel="noopener noreferrer">Cookie Policy</a>}
      {termsUrl && <a href={termsUrl} style={linkStyle} target="_blank" rel="noopener noreferrer">Termini e Condizioni di Utilizzo</a>}
      {stateAidUrl && <a href={stateAidUrl} style={linkStyle} target="_blank" rel="noopener noreferrer">Trasparenza Aiuto di Stato</a>}
    </footer>
  );
};

export default Footer;
