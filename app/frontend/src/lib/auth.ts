import { supabase } from './supabase'

class AuthApi {
  async getCurrentUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    return user
  }

  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      throw error
    }

    return data
  }

  async logout() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      throw error
    }
  }
}

export const authApi = new AuthApi()