/* eslint-disable no-underscore-dangle */
import { Row, Col, Button, Form } from 'react-bootstrap'
import InputHint from '../../components/InputHint/InputHint'
import SideBar from '../../components/Sidebar/SideBar'
import Footer from '../../components/Footer/Footer'
import { setAlert } from '../../redux/_actions/alertAction'
import { useForm } from 'react-hook-form'
import { useProfile, useUpdateProfile } from '../../hooks/api/useProfile'
import { useAppDispatch } from '../../redux/hooks'

interface UserFormValues {
  _id: string
  name: string
  companyName: string
  email: string
  password: string
  currentPassword: string
  newPassword: string
}

const Profile = () => {
  const { register, handleSubmit } = useForm<UserFormValues>()
  const dispatch = useAppDispatch()

  const { data: dbUser, isLoading, error } = useProfile()

  const { mutateAsync: updateProfileMutation } = useUpdateProfile()

  const onSubmit = async (data: UserFormValues) => {
    if (data.name === '' || data.email === '') {
      dispatch(
        setAlert('Naam en email zijn verplicht, voer deze in.', 'danger'),
      )
      return
    }

    try {
      await updateProfileMutation(data)
    } catch (error) {
      console.error('[Profile] Profile update error:', error)
    }
  }

  const renderProfile = (dbUser: {
    _id?: string
    name?: string
    email?: string
    companyName?: string
  }) => {
    const loading = isLoading

    return !loading ? (
      <div>
        <Form.Group>
          <Form.Label>Naam</Form.Label>
          <input type="hidden" defaultValue={dbUser._id} {...register('_id')} />
          <input
            type="text"
            className="form-control"
            placeholder="Naam"
            defaultValue={dbUser.name}
            {...register('name', { required: true })}
          />
        </Form.Group>
        <Form.Group>
          <Form.Label>Email</Form.Label>
          <input
            type="email"
            className="form-control"
            placeholder="Email"
            defaultValue={dbUser.email}
            {...register('email', { required: true })}
          />
        </Form.Group>
        <Form.Group>
          <Form.Label>Bedrijfsnaam</Form.Label>
          <input
            type="text"
            className="form-control"
            placeholder="Bedrijfsnaam"
            defaultValue={dbUser.companyName}
            {...register('companyName')}
            autoComplete="Companyname"
          />
        </Form.Group>
        <Form.Group>
          <Form.Label>Huidig Wachtwoord</Form.Label>
          <input
            type="password"
            autoComplete="current-password"
            className="form-control"
            placeholder="Huidig wachtwoord"
            minLength={6}
            {...register('currentPassword')}
          />
        </Form.Group>
        <Form.Group>
          <Form.Label>Nieuw Wachtwoord</Form.Label>
          <input
            type="password"
            autoComplete="new-password"
            className="form-control"
            placeholder="Nieuw wachtwoord"
            minLength={6}
            {...register('newPassword')}
          />
          <InputHint>Gebruik minstens zes karakters.</InputHint>
        </Form.Group>
      </div>
    ) : (
      <div />
    )
  }

  if (error) {
    console.error('Error loading profile:', error)
  }

  return (
    <div>
      <SideBar />
      <div className="body-content content-wrapper">
        <h2 className="icon-user short" title="Contacten/klanten">
          {' '}
        </h2>
        <Row>
          <Col md={12}>
            <div className="box box-primary">
              <div className="box-header with-border">
                <h3 className="box-title">Gebruiker</h3>
              </div>
              <form onSubmit={handleSubmit(onSubmit)}>
                <div className="box-body">
                  {renderProfile(dbUser)}

                  <div className="box-footer">
                    <Button type="submit">Profiel Opslaan</Button>
                  </div>
                </div>
              </form>
            </div>
          </Col>
        </Row>
        <Footer />
      </div>
    </div>
  )
}
export default Profile
