import { Helmet } from 'react-helmet-async';
import ContentPage from '../../components/content/ContentPage';
import Mimi from '../../components/chat/Mimi';

export default function Contact() {
  return (
    <>
      <Helmet>
        <title>Contact Us — TISL Store</title>
        <meta name="description" content="Get in touch with TISL Store." />
      </Helmet>
      <ContentPage slug="contact" loadingRows={3} />
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px 48px' }}>
        <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#a855f7', marginBottom: 12 }}>
          ✨ Or chat with Mimi instantly
        </p>
        <Mimi embedded />
      </div>
    </>
  );
}