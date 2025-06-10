'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { getProductById, Product } from '@/lib/products';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import Footer from '@/components/Footer';

// Make sure to set this in your .env.local file
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function CheckoutContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState<string | null>(null);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [pageStatus, setPageStatus] = useState<
    'loading' | 'ready_to_pay' | 'payment_success' | 'payment_cancelled' | 'error_loading' | 'error_payment'
  >('loading');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [stripeSessionIdForCancelLog, setStripeSessionIdForCancelLog] = useState<string | null>(null);

  useEffect(() => {
    const paymentSuccess = searchParams.get('payment_success') === 'true';
    const paymentCancelled = searchParams.get('payment_cancelled') === 'true';
    const sessionIdFromUrl = searchParams.get('session_id'); // For success message or future cancellation logging
    const emailParam = searchParams.get('email');
    const productIdParam = searchParams.get('productId');
    const sellerIdParam = searchParams.get('sellerId');

    let loadedEmail: string | null = null;
    let loadedProduct: Product | null = null;

    if (emailParam) {
      loadedEmail = decodeURIComponent(emailParam);
      setEmail(loadedEmail);
    }
    if (productIdParam) {
      const p = getProductById(productIdParam);
      if (p) {
        loadedProduct = p;
        setProduct(p);
      }
    }

    if (sellerIdParam) {
      setSellerId(sellerIdParam);
    }

    if (sessionIdFromUrl) setStripeSessionIdForCancelLog(sessionIdFromUrl); // Store for potential cancel log

    if (paymentSuccess) {
      setPageStatus('payment_success');
      setStatusMessage('Pagamento riuscito! Il tuo ordine è confermato. Ora puoi chiudere questa pagina.');
    } else if (paymentCancelled) {
      setPageStatus('payment_cancelled');
      setStatusMessage('Pagamento annullato. Non ti è stato addebitato alcun importo.');
      if (loadedEmail && loadedProduct && sessionIdFromUrl) {
        // Attempt to log the cancellation event
        fetch('/api/log-cancellation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-API-Secret': process.env.NEXT_PUBLIC_ADMIN_API_SECRET || '' // Send the public admin secret
          },
          body: JSON.stringify({
            email: loadedEmail,
            productId: loadedProduct.id,
            stripeSessionId: sessionIdFromUrl
          }),
        })
        .then(async res => {
          if (!res.ok) {
            const errorData = await res.json();
            console.warn('Failed to log cancellation event:', res.status, errorData?.error);
          } else {
            console.log('Cancellation event logged successfully.');
          }
        })
        .catch(err => {
          console.warn('Error calling log-cancellation API:', err);
        });
      }
    } else {
      if (loadedEmail && loadedProduct) {
        setPageStatus('ready_to_pay');
        setStatusMessage(null); // Clear any previous messages
      } else {
        setPageStatus('error_loading');
        if (!loadedEmail) setStatusMessage('Email non fornito o non valido nell\'URL.');
        else if (!loadedProduct) setStatusMessage('ID prodotto non fornito o non valido nell\'URL.');
        else setStatusMessage('Si è verificato un problema durante il caricamento dei dettagli dell\'ordine dall\'URL.');
      }
    }
  }, [searchParams]);

  const handlePayment = async () => {
    if (!product || !email) {
      setPageStatus('error_payment');
      setStatusMessage('Impossibile procedere con il pagamento: mancano informazioni sul prodotto o sull\'email.');
      return;
    }
    setIsLoading(true);
    setPageStatus('loading'); // Indicate processing for payment initiation
    setStatusMessage(null);

    try {
      const response = await fetch('/api/checkout_sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, productId: product.id, sellerId }),
      });

      const session = await response.json();

      if (response.ok && session.sessionId) {
        const stripe = await stripePromise;
        if (stripe) {
          const { error: stripeError } = await stripe.redirectToCheckout({ sessionId: session.sessionId });
          if (stripeError) {
            console.error('Stripe redirection error:', stripeError);
            setPageStatus('error_payment');
            setStatusMessage(stripeError.message || 'Reindirizzamento a Stripe non riuscito.');
          }
        } else {
          setPageStatus('error_payment');
          setStatusMessage('Caricamento di Stripe.js non riuscito.');
        }
      } else {
        setPageStatus('error_payment');
        setStatusMessage(session.error || 'Creazione della sessione di pagamento non riuscita.');
      }
    } catch (err: any) {
      console.error('Payment initiation error:', err);
      setPageStatus('error_payment');
      setStatusMessage(err.message || 'Si è verificato un errore imprevisto durante l\'avvio del pagamento.');
    }
    setIsLoading(false); // Ensure loading is false if an error occurs before redirection
  };

  const pageStyle: React.CSSProperties = { padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: 'auto', textAlign: 'center' };
  const boxStyle: React.CSSProperties = { padding: '20px', border: '1px solid #ccc', borderRadius: '5px', marginTop: '20px' };
  const summaryBoxStyle: React.CSSProperties = { ...boxStyle, backgroundColor: '#f9f9f9', textAlign: 'left' };
  const buttonStyle: React.CSSProperties = { display: 'inline-block', marginTop: '15px', textDecoration: 'none', padding: '10px 15px', backgroundColor: '#007bff', color: 'white', borderRadius: '5px' };

  if (pageStatus === 'loading' && !searchParams.get('payment_success') && !searchParams.get('payment_cancelled')) {
    return <div style={pageStyle}><h1>Caricamento dei dettagli dell'ordine...</h1></div>;
  }

  if (pageStatus === 'error_loading') {
    return (
      <div style={{ ...pageStyle, ...boxStyle, color: 'red', backgroundColor: '#ffebee' }}>
        <h2>Errore nel caricamento dei dettagli</h2>
        <p>{statusMessage || 'Impossibile caricare i dettagli dell\'ordine dall\'URL.'}</p>
        <a href="/admin" style={buttonStyle}>Torna all'Admin</a>
      </div>
    );
  }

  return (
    <>
      <div style={pageStyle}>
      {(product && email) && (
        <>
          <h1>Riepilogo Ordine</h1>
          <div style={summaryBoxStyle}>
            <p style={{color: '#333'}}><strong>Email:</strong> {email}</p>
            <p style={{color: '#333'}}><strong>Prodotto:</strong> {product.name}</p>
            {sellerId && <p style={{color: '#333'}}><strong>ID Venditore:</strong> {sellerId}</p>}
            <p style={{color: '#333'}}><strong>Prezzo:</strong> €{product.price.toFixed(2)}</p>
            <p style={{color: '#333'}}><strong>Punti che verranno assegnati:</strong> {product.points}</p>
          </div>
        </>
      )}

      {pageStatus === 'payment_success' && (
        <div style={{ ...boxStyle, backgroundColor: '#e6ffed' }}>
          <h2 style={{color: '#333'}}>Stato del Pagamento</h2>
          <p style={{color: '#333'}}>{statusMessage}</p>
          <a href="/admin" style={buttonStyle}>Torna all'Admin</a>
        </div>
      )}

      {pageStatus === 'payment_cancelled' && (
        <div style={{ ...boxStyle, backgroundColor: '#fff3e0' }}>
          <h2 style={{color: '#333'}}>Pagamento Annullato</h2>
          <p style={{color: '#333'}}>{statusMessage}</p>
          <p style={{marginTop: '10px', color: '#333'}}>Ora puoi chiudere questa pagina in sicurezza.</p>
          <a href="/admin" style={buttonStyle}>Torna all'Admin</a>
        </div>
      )}
      
      {pageStatus === 'error_payment' && (
         <div style={{ ...boxStyle, color: 'red', backgroundColor: '#ffebee' }}>
            <h2 style={{color: '#333'}}>Errore di Pagamento</h2>
            <p style={{color: '#333'}}>{statusMessage}</p>
            {(product && email) && 
              <button onClick={() => { setPageStatus('ready_to_pay'); setStatusMessage(null); setIsLoading(false); }} style={{...buttonStyle, backgroundColor: '#ffc107', color: '#333', marginRight: '10px' }}>Riprova il Pagamento</button>
            }
            <a href="/admin" style={buttonStyle}>Torna all'Admin</a>
        </div>
      )}

      {pageStatus === 'ready_to_pay' && product && email && (
        <div style={boxStyle}>
          <h2>Conferma i dati e procedi al pagamento</h2>
          <button 
            onClick={handlePayment}
            disabled={isLoading}
            style={{
              padding: '12px 20px',
              backgroundColor: isLoading ? '#aaa' : '#6772e5',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              fontSize: '16px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              width: '100%',
              marginTop: '10px'
            }}
          >
            {isLoading ? 'Calcolando...' : `Procedi al Pagamento di €${product.price.toFixed(2)}`}
          </button>
        </div>
      )}
    </div>
    <Footer />
    </>
  );
}

export default function CheckoutPage() {
  return (
    // Suspense is crucial for useSearchParams to work correctly during SSR and initial client render
    <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center' }}><h1>Loading...</h1></div>}> 
      <CheckoutContent />
    </Suspense>
  );
}
