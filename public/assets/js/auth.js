window.handleGoogleSignIn = async (response) => {
  const credential = response.credential;
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential })
    });
    
    if (!res.ok) {
      const data = await res.json();
      const errEl = document.getElementById('error-message');
      const errText = document.getElementById('error-text');
      if (errEl && errText) {
        errText.innerText = data.error || 'Failed to login with Google';
        errEl.classList.remove('hidden');
      } else {
        alert(data.error || 'Failed to login with Google');
      }
    } else {
      window.location.href = '/dashboard.html';
    }
  } catch (err) {
    alert('Network error during Google Sign-In');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const errorMessage = document.getElementById('error-message');
  const errorText = document.getElementById('error-text');
  const btnSubmit = document.getElementById('btn-submit');

  const showError = (msg) => {
    errorText.innerText = msg;
    errorMessage.classList.remove('hidden');
    if(btnSubmit) {
       btnSubmit.disabled = false;
       btnSubmit.innerText = loginForm ? 'Sign in' : 'Sign up';
    }
  };

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorMessage.classList.add('hidden');
      btnSubmit.disabled = true;
      btnSubmit.innerText = 'Signing in...';

      const email = document.getElementById('email-address').value;
      const password = document.getElementById('password').value;

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        
        if (!res.ok) {
          showError(data.error || 'Failed to login');
        } else {
          window.location.href = '/dashboard.html';
        }
      } catch (err) {
        showError('Network error occurred.');
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorMessage.classList.add('hidden');
      btnSubmit.disabled = true;
      btnSubmit.innerText = 'Signing up...';

      const email = document.getElementById('email-address').value;
      const password = document.getElementById('password').value;

      try {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        
        if (!res.ok) {
          showError(data.error || 'Failed to register');
        } else {
          window.location.href = '/dashboard.html';
        }
      } catch (err) {
        showError('Network error occurred.');
      }
    });
  }
});
