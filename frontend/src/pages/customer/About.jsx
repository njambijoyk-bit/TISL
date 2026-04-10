import { Helmet } from 'react-helmet-async';
import ContentPage from '../../components/content/ContentPage';

export default function About() {
  return (
    <>
      <Helmet>
        <title>About Us — TISL Store</title>
        <meta name="description" content="Learn more about TISL Store — who we are, what we do, and our mission to serve customers in Nairobi." />
      </Helmet>
      <ContentPage slug="about" loadingRows={5} />
    </>
  );
}