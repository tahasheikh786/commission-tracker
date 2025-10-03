'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Building2, User, ArrowRight, ArrowLeft, AlertCircle, Lock, Eye, EyeOff, Moon, Sun } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { isEmailAuthorized, getAuthorizedEmails } from '@/utils/emailValidation';

export default function SignupPage() {
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    companyName: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailValid, setIsEmailValid] = useState(true);
  const { requestOTP, isAuthenticated } = useAuth();
  const { theme, setTheme, actualTheme } = useTheme();
  const router = useRouter();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Validate email in real-time
    if (name === 'email') {
      const emailValid = value.trim() === '' || isEmailAuthorized(value);
      setIsEmailValid(emailValid);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const validateForm = () => {
    if (!formData.email || !formData.firstName || !formData.lastName || !formData.password) {
      toast.error('Please fill in all required fields');
      return false;
    }

    if (!isEmailAuthorized(formData.email)) {
      toast.error('This email address is not authorized for registration');
      return false;
    }

    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      // Always request OTP for registration (mandatory)
      await requestOTP({ email: formData.email, purpose: 'registration' });
      toast.success('Verification code sent to your email!');
      // Redirect to OTP verification page with user data
      const params = new URLSearchParams({
        email: formData.email,
        purpose: 'registration',
        firstName: formData.firstName,
        lastName: formData.lastName,
        companyName: formData.companyName || '',
        password: formData.password
      });
      router.push(`/auth/verify-otp?${params.toString()}`);
    } catch (error: any) {
      toast.error(error.message || 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${actualTheme === 'dark' ? 'dark' : ''}`}>
      <div className="absolute inset-0 bg-slate-50 dark:bg-slate-900"></div>
      <div className="w-full max-w-md relative z-10">
        {/* Theme Toggle */}
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={() => setTheme(actualTheme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm cursor-pointer"
            aria-label={`Switch to ${actualTheme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {actualTheme === 'dark' ? <Sun className="w-5 h-5 text-slate-300" /> : <Moon className="w-5 h-5 text-slate-600" />}
          </button>
        </div>
        {/* Logo and Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl mb-4 shadow-lg">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 dark:from-slate-100 dark:via-slate-200 dark:to-slate-300 bg-clip-text text-transparent mb-2">
            Commission Tracker
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Create your account to get started
          </p>
        </motion.div>

        {/* Signup Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 border border-slate-200 dark:border-slate-700"
        >
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
              Create Account
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Create your account to get started
            </p>
          </div>


          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  First Name *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className="block w-full pl-10 pr-3 py-3 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400"
                    placeholder="First name"
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Last Name *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    className="block w-full pl-10 pr-3 py-3 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400"
                    placeholder="Last name"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Company Name Field */}
            <div>
              <label htmlFor="companyName" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Company Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Building2 className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="companyName"
                  name="companyName"
                  type="text"
                  value={formData.companyName}
                  onChange={handleInputChange}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400"
                  placeholder="Your company name"
                />
              </div>
            </div>

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Email Address *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className={`h-5 w-5 ${!isEmailValid && formData.email ? 'text-red-400' : 'text-slate-400'}`} />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className={`block w-full pl-10 pr-3 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 ${
                    !isEmailValid && formData.email 
                      ? 'border-red-300 dark:border-red-500 focus:ring-red-500 bg-red-50 dark:bg-red-900/20' 
                      : 'border-slate-200 dark:border-slate-600 focus:ring-blue-500'
                  }`}
                  placeholder="Enter your email"
                  required
                />
                {!isEmailValid && formData.email && (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                  </div>
                )}
              </div>
              {!isEmailValid && formData.email && (
                <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-start">
                    <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 mr-2 flex-shrink-0" />
                    <div className="text-sm text-red-700 dark:text-red-300">
                      <p className="font-medium">Email not authorized</p>
                      <p className="mt-1">Only authorized email addresses can register. Contact your administrator for access.</p>
                      <p className="mt-2 text-xs">
                        <strong>Authorized emails:</strong> {getAuthorizedEmails().join(', ')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Password *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={handleInputChange}
                  className="block w-full pl-10 pr-12 py-3 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400"
                  placeholder="Create a password (min. 6 characters)"
                  required
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={isLoading || (!isEmailValid && formData.email !== '') || !formData.email || !formData.firstName || !formData.lastName || !formData.password}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-4 rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center shadow-lg hover:shadow-xl cursor-pointer"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Register
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </motion.button>
          </form>


          {/* Login Link */}
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              Already have an account?{' '}
              <Link 
                href="/auth/login" 
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold inline-flex items-center transition-colors"
              >
                Sign in
                <ArrowLeft className="ml-1 h-3 w-3 rotate-180" />
              </Link>
            </p>
          </div>

          {/* Footer */}
          <div className="mt-4">
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              Secure access with OTP verification and domain-based authentication
            </p>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
